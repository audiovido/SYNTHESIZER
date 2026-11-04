#include "PluginEditor.h"

#include <BinaryData.h>

static std::string resourceByFile(const juce::String& file, int& size) {
  for (int i = 0; i < BinaryData::namedResourceListSize; i++) {
    if (file == BinaryData::getNamedResourceOriginalFilename(BinaryData::namedResourceList[i])) {
      const char* d = BinaryData::getNamedResource(BinaryData::namedResourceList[i], size);
      return d ? std::string(d, static_cast<size_t>(size)) : std::string();
    }
  }
  size = 0;
  return {};
}

static juce::String mimeFor(const juce::String& f) {
  const auto ext = f.fromLastOccurrenceOf(".", false, false).toLowerCase();
  if (ext == "html") return "text/html; charset=utf-8";
  if (ext == "js" || ext == "mjs") return "text/javascript; charset=utf-8";
  if (ext == "css") return "text/css; charset=utf-8";
  if (ext == "svg") return "image/svg+xml";
  if (ext == "png") return "image/png";
  if (ext == "jpg" || ext == "jpeg") return "image/jpeg";
  if (ext == "json") return "application/json; charset=utf-8";
  if (ext == "woff2") return "font/woff2";
  return "application/octet-stream";
}

SY1Editor::SY1Editor(SY1Processor& p) : AudioProcessorEditor(&p), proc_(p) {
  setResizable(true, true);
  setResizeLimits(720, 480, 2400, 1600);
  setSize(1180, 780);
  proc_.engine().takeOutgoing();  // calls made while the window was closed are already in the state it starts from
  build();
  startTimerHz(30);
}

SY1Editor::~SY1Editor() { stopTimer(); }

std::optional<juce::WebBrowserComponent::Resource> SY1Editor::serve(const juce::String& url) {
  // UI files are stored flat (vite names are unique): serve by file name
  juce::String file = url.upToFirstOccurrenceOf("?", false, false).fromLastOccurrenceOf("/", false, false);
  if (file.isEmpty() || file == "index.html") file = "ui-index.html";
  int size = 0;
  const std::string data = resourceByFile(file, size);
  if (!size) return std::nullopt;
  std::vector<std::byte> bytes(data.size());
  std::memcpy(bytes.data(), data.data(), data.size());
  return juce::WebBrowserComponent::Resource{std::move(bytes), mimeFor(file)};
}

juce::String SY1Editor::userScript() {
  int size = 0;
  const std::string shim = resourceByFile("wa-shim.js", size);
  const std::string state = proc_.currentState();
  juce::String s;
  s << "window.__SY1_UI = true; window.__SY1_RATE = " << juce::String(proc_.engineRate() > 0 ? proc_.engineRate() : 48000.0) << ";\n";
  // the window starts from the plugin's saved state, in its own memory (never the WebView's storage)
  s << "(function () { let seed = {}; try { seed = JSON.parse(" << juce::JSON::toString(juce::var(juce::String::fromUTF8(state.empty() ? "{}" : state.c_str())))
    << "); } catch (e) {}\n"
       "  const m = new Map(Object.entries(seed));\n"
       "  // settings only the window keeps (open page, favourites) are stored in the plugin's state too\n"
       "  const uiOnly = (k) => /^sy1\\.m\\.[^.]+\\.(page|favs)$/.test(k);\n"
       "  const ls = { getItem: (k) => (m.has(k) ? m.get(k) : null),\n"
       "    setItem: (k, v) => { v = String(v); m.set(k, v); if (uiOnly(k) && window.__SY1_PLUGIN__) window.__SY1_PLUGIN__.send('uiStore', [k, v]); },\n"
       "    removeItem: (k) => { m.delete(k); },\n"
       "    clear: () => m.clear(), key: (i) => Array.from(m.keys())[i] ?? null, get length() { return m.size; } };\n"
       "  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ls }); } catch (e) {}\n"
       "})();\n";
  s << juce::String::fromUTF8(shim.c_str(), static_cast<int>(shim.size())) << "\n";
  s << "window.__SY1_SCOPE = new Float32Array(512);\n"
       "window.__SY1_PLUGIN__ = { onCall: null, send(name, args) { const b = window.__JUCE__ && window.__JUCE__.backend; if (b) b.emitEvent('sy1call', { name, args: JSON.stringify(args) }); } };\n"
       "(function hook() { const b = window.__JUCE__ && window.__JUCE__.backend; if (!b) { setTimeout(hook, 20); return; }\n"
       "  b.addEventListener('sy1', (e) => { if (e.scope) window.__SY1_SCOPE = e.scope;\n"
       "    for (const c of e.calls || []) { try { const p = window.__SY1_PLUGIN__; if (p.onCall) p.onCall(c.name, JSON.parse(c.args)); } catch (x) {} }\n"
       "    try { const p = window.__SY1_PLUGIN__; if (e.host && p.onHost) p.onHost(e.host); } catch (x) {} });\n"
       "})();\n";
  return s;
}

void SY1Editor::build() {
  auto options = juce::WebBrowserComponent::Options{}
                     .withBackend(juce::WebBrowserComponent::Options::Backend::webview2)
                     .withWinWebView2Options(juce::WebBrowserComponent::Options::WinWebView2{}.withUserDataFolder(
                         juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("SY-1-webview")))
                     .withNativeIntegrationEnabled()
                     .withKeepPageLoadedWhenBrowserIsHidden()
                     .withUserScript(userScript())
                     .withResourceProvider([this](const juce::String& url) { return serve(url); })
                     .withEventListener("sy1call", [this](const juce::var& v) {
                       const juce::String name = v.getProperty("name", {}).toString();
                       const juce::String args = v.getProperty("args", "[]").toString();
                       if (name == "saveFile") { saveFile(args); return; }
                       if (name.isNotEmpty()) proc_.engine().post(name.toStdString(), args.toStdString());
                     });
  web_ = std::make_unique<juce::WebBrowserComponent>(options);
  addAndMakeVisible(*web_);
  web_->goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
  resized();
}

/** A file from the window (the drum pattern as MIDI): written to Music/SY-1 and shown in
 *  Finder / Explorer, from where it is dragged into the DAW. args = [fileName, base64]. */
void SY1Editor::saveFile(const juce::String& argsJson) {
  const juce::var a = juce::JSON::parse(argsJson);
  if (!a.isArray() || a.size() < 2) return;
  juce::String fileName = juce::File::createLegalFileName(a[0].toString());
  if (fileName.isEmpty()) fileName = "SY-1.mid";
  juce::MemoryOutputStream bytes;
  if (!juce::Base64::convertFromBase64(bytes, a[1].toString()) || bytes.getDataSize() == 0) return;
  const juce::File dir = juce::File::getSpecialLocation(juce::File::userMusicDirectory).getChildFile("SY-1");
  if (!dir.createDirectory()) return;
  const juce::File f = dir.getNonexistentChildFile(juce::File(dir.getChildFile(fileName)).getFileNameWithoutExtension(),
                                                   juce::File(fileName).getFileExtension(), false);
  if (f.replaceWithData(bytes.getData(), bytes.getDataSize())) f.revealToUser();
}

void SY1Editor::reloadUi() {
  removeChildComponent(web_.get());
  web_.reset();
  build();
}

void SY1Editor::timerCallback() {
  if (!web_) return;
  auto calls = proc_.engine().takeOutgoing();
  const auto scope = proc_.engine().scope();
  auto* obj = new juce::DynamicObject();
  juce::Array<juce::var> cs;
  for (auto& c : calls) {
    auto* o = new juce::DynamicObject();
    o->setProperty("name", juce::String(c.first));
    o->setProperty("args", juce::String(c.second));
    cs.add(juce::var(o));
  }
  obj->setProperty("calls", cs);
  juce::Array<juce::var> sc;
  for (size_t i = 0; i < scope.size(); i += 2) sc.add(scope[i]);
  obj->setProperty("scope", sc);
  auto* host = new juce::DynamicObject();
  host->setProperty("bpm", proc_.hostBpmForUi());
  host->setProperty("playing", proc_.hostPlayingForUi());
  obj->setProperty("host", juce::var(host));
  web_->emitEventIfBrowserIsVisible("sy1", juce::var(obj));
}

void SY1Editor::paint(juce::Graphics& g) {
  g.fillAll(juce::Colour(0xff121316));
  if (proc_.engineError().isNotEmpty()) {
    g.setColour(juce::Colours::orange);
    g.drawFittedText("SY-1 engine error: " + proc_.engineError(), getLocalBounds().reduced(20), juce::Justification::centred, 8);
  }
}

void SY1Editor::resized() {
  if (web_) web_->setBounds(getLocalBounds());
}
