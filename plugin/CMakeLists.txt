# SY-1 plugin (AU / VST3 / Standalone) — JUCE 8.
#   ./prepare.sh                        # bundles the engine and the web UI into resources/
#   cmake -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build --config Release
cmake_minimum_required(VERSION 3.22)
project(SY1 VERSION 0.1.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)
if(DEFINED JUCE_DIR)
  add_subdirectory(${JUCE_DIR} juce)
else()
  FetchContent_Declare(juce GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.4 GIT_SHALLOW TRUE)
  FetchContent_MakeAvailable(juce)
endif()

set(FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND FORMATS AU)
endif()

juce_add_plugin(SY1
  COMPANY_NAME "Audiovido"
  BUNDLE_ID com.audiovido.sy1
  PLUGIN_MANUFACTURER_CODE Avdo
  PLUGIN_CODE Sy1x
  PRODUCT_NAME "SY-1"
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  VST3_CATEGORIES Instrument Synth
  COPY_PLUGIN_AFTER_BUILD FALSE
  FORMATS ${FORMATS})

file(GLOB_RECURSE SY1_RESOURCES CONFIGURE_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/resources/*)
if(NOT SY1_RESOURCES)
  message(FATAL_ERROR "resources/ is empty: run plugin/prepare.sh first")
endif()
juce_add_binary_data(SY1Resources SOURCES ${SY1_RESOURCES})

set(QJS ${CMAKE_CURRENT_SOURCE_DIR}/../native/third_party/quickjs)
add_library(quickjs STATIC ${QJS}/quickjs.c ${QJS}/libregexp.c ${QJS}/libunicode.c ${QJS}/dtoa.c)
target_include_directories(quickjs PUBLIC ${QJS})
set_target_properties(quickjs PROPERTIES POSITION_INDEPENDENT_CODE ON C_STANDARD 11)
if(MSVC)
  target_compile_options(quickjs PRIVATE /w)
else()
  target_compile_options(quickjs PRIVATE -w -O2)
endif()

target_sources(SY1 PRIVATE Source/PluginProcessor.cpp Source/PluginEditor.cpp)
target_include_directories(SY1 PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/../native)
target_compile_definitions(SY1 PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0
  JUCE_DISPLAY_SPLASH_SCREEN=0)
# no fused multiply-add: the engine computes like the browser's JavaScript (same results on Apple Silicon)
if(NOT MSVC)
  target_compile_options(SY1 PRIVATE -ffp-contract=off)
endif()
target_link_libraries(SY1 PRIVATE SY1Resources quickjs
  juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
