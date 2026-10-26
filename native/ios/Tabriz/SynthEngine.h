// Tabriz iOS — audio engine bridge (Objective-C interface for Swift).
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface SynthEngine : NSObject

/// Starts the audio session and the engine. Safe to call again after an interruption.
- (BOOL)startAndReturnError:(NSError **)error;

/// Requested hardware buffer in frames (64, 128, 256, 512). iOS may round it.
- (void)setPreferredBufferFrames:(int)frames;

- (void)noteDown:(int)midi velocity:(double)velocity;
- (void)noteUp:(int)midi;
- (void)allNotesOff;
- (void)setPitchBend:(double)value;   ///< -1..1
- (void)setModWheel:(double)value;    ///< 0..1
- (void)setNumber:(double)value forKey:(NSString *)key;
- (void)setChoice:(NSString *)value forKey:(NSString *)key;

/// Copies the most recent `count` output samples (up to 4096) for the oscilloscope.
- (void)copyScopeInto:(float *)buffer count:(int)count;

@property (nonatomic, readonly) double sampleRate;
@property (nonatomic, readonly) int bufferFrames;        ///< frames per render call (measured)
@property (nonatomic, readonly) double ioBufferMs;       ///< hardware buffer duration
@property (nonatomic, readonly) double outputLatencyMs;  ///< iOS-reported output latency
@property (nonatomic, readonly) double dspLoad;          ///< render time / buffer time (average, 0..1)
@property (nonatomic, readonly) double dspLoadPeak;      ///< worst recent render, 0..1
@property (nonatomic, readonly) int glitches;            ///< renders that took longer than the buffer

@end

NS_ASSUME_NONNULL_END
