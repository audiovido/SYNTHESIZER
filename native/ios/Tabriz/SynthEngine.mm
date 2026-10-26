// Tabriz iOS — audio engine bridge.
//
// AVAudioEngine + AVAudioSourceNode. The render block runs on the real-time
// audio thread and only calls TabrizHost::render (no locks, no allocation, no
// Objective-C messaging). Notes and parameters travel through the lock-free
// CommandQueue inside TabrizHost.
#import "SynthEngine.h"
#import <AVFoundation/AVFoundation.h>
#include <atomic>
#include <mach/mach_time.h>
#include <memory>
#include "tabriz_host.hpp"

namespace {
struct Stats {
  std::atomic<double> load{0}, peak{0};
  std::atomic<int> frames{0}, glitches{0};
};
}  // namespace

@implementation SynthEngine {
  AVAudioEngine *_engine;
  AVAudioSourceNode *_source;
  std::unique_ptr<sy1::TabrizHost> _host;
  std::unique_ptr<sy1::Controller> _mono;
  std::unique_ptr<Stats> _stats;
  double _sr;
  int _preferredFrames;
  NSMutableDictionary<NSString *, id> *_params;  // last value of every param (re-sent after a restart)
}

- (instancetype)init {
  if ((self = [super init])) {
    _preferredFrames = 128;
    _params = [NSMutableDictionary dictionary];
    _stats = std::make_unique<Stats>();
    NSNotificationCenter *nc = NSNotificationCenter.defaultCenter;
    [nc addObserver:self selector:@selector(onInterruption:) name:AVAudioSessionInterruptionNotification object:nil];
    [nc addObserver:self selector:@selector(onMediaReset:) name:AVAudioSessionMediaServicesWereResetNotification object:nil];
  }
  return self;
}

- (void)dealloc {
  [NSNotificationCenter.defaultCenter removeObserver:self];
  [_engine stop];
}

- (BOOL)startAndReturnError:(NSError **)error {
  AVAudioSession *s = AVAudioSession.sharedInstance;
  // Playback: plays even with the silent switch on, and stops other audio.
  if (![s setCategory:AVAudioSessionCategoryPlayback mode:AVAudioSessionModeDefault options:0 error:error]) return NO;
  [s setPreferredSampleRate:48000 error:nil];
  [s setPreferredIOBufferDuration:_preferredFrames / 48000.0 error:nil];
  if (![s setActive:YES error:error]) return NO;
  _sr = s.sampleRate > 0 ? s.sampleRate : 48000;

  [_engine stop];
  _engine = [[AVAudioEngine alloc] init];
  _host = std::make_unique<sy1::TabrizHost>(_sr);
  _mono = std::make_unique<sy1::Controller>(_host->queue);

  sy1::TabrizHost *host = _host.get();
  Stats *stats = _stats.get();
  const double sr = _sr;
  static mach_timebase_info_data_t tb;
  if (tb.denom == 0) mach_timebase_info(&tb);

  AVAudioFormat *fmt = [[AVAudioFormat alloc] initStandardFormatWithSampleRate:_sr channels:2];
  _source = [[AVAudioSourceNode alloc] initWithFormat:fmt
      renderBlock:^OSStatus(BOOL *isSilence, const AudioTimeStamp *ts, AVAudioFrameCount frameCount, AudioBufferList *abl) {
        (void)isSilence; (void)ts;
        const uint64_t t0 = mach_absolute_time();
        float *L = static_cast<float *>(abl->mBuffers[0].mData);
        float *R = abl->mNumberBuffers > 1 ? static_cast<float *>(abl->mBuffers[1].mData) : nullptr;
        host->render(L, R, static_cast<int>(frameCount));
        const double ns = double(mach_absolute_time() - t0) * tb.numer / tb.denom;
        const double load = ns / (frameCount / sr * 1e9);
        stats->load.store(stats->load.load(std::memory_order_relaxed) * 0.98 + load * 0.02, std::memory_order_relaxed);
        const double pk = stats->peak.load(std::memory_order_relaxed) * 0.999;
        stats->peak.store(load > pk ? load : pk, std::memory_order_relaxed);
        stats->frames.store(static_cast<int>(frameCount), std::memory_order_relaxed);
        if (load > 1.0) stats->glitches.fetch_add(1, std::memory_order_relaxed);
        return noErr;
      }];
  [_engine attachNode:_source];
  [_engine connect:_source to:_engine.mainMixerNode format:fmt];
  [_engine prepare];
  if (![_engine startAndReturnError:error]) return NO;

  // restore the patch after a restart
  for (NSString *key in _params) {
    id v = _params[key];
    if ([v isKindOfClass:NSString.class]) _mono->setStr(key.UTF8String, [(NSString *)v UTF8String]);
    else _mono->setNum(key.UTF8String, [(NSNumber *)v doubleValue]);
  }
  return YES;
}

- (void)setPreferredBufferFrames:(int)frames {
  _preferredFrames = frames;
  [AVAudioSession.sharedInstance setPreferredIOBufferDuration:frames / (_sr > 0 ? _sr : 48000.0) error:nil];
  _stats->peak.store(0);
  _stats->glitches.store(0);
}

- (void)noteDown:(int)midi velocity:(double)velocity { if (_mono) _mono->keyDown(midi, velocity); }
- (void)noteUp:(int)midi { if (_mono) _mono->keyUp(midi); }
- (void)allNotesOff { if (_mono) _mono->allOff(); }
- (void)setPitchBend:(double)value { if (_mono) _mono->bend(value); }
- (void)setModWheel:(double)value { if (_mono) _mono->mod(value); }

- (void)setNumber:(double)value forKey:(NSString *)key {
  _params[key] = @(value);
  if (_mono) _mono->setNum(key.UTF8String, value);
}

- (void)setChoice:(NSString *)value forKey:(NSString *)key {
  _params[key] = [value copy];
  if (_mono) _mono->setStr(key.UTF8String, value.UTF8String);
}

- (double)sampleRate { return _sr; }
- (int)bufferFrames { return _stats->frames.load(); }
- (double)ioBufferMs { return AVAudioSession.sharedInstance.IOBufferDuration * 1000.0; }
- (double)outputLatencyMs { return AVAudioSession.sharedInstance.outputLatency * 1000.0; }
- (double)dspLoad { return _stats->load.load(); }
- (double)dspLoadPeak { return _stats->peak.load(); }
- (int)glitches { return _stats->glitches.load(); }

- (void)onInterruption:(NSNotification *)n {
  NSUInteger type = [n.userInfo[AVAudioSessionInterruptionTypeKey] unsignedIntegerValue];
  if (type == AVAudioSessionInterruptionTypeBegan) {
    if (_mono) _mono->allOff();
  } else {
    [self startAndReturnError:nil];
  }
}

- (void)onMediaReset:(NSNotification *)n {
  (void)n;
  [self startAndReturnError:nil];
}

@end
