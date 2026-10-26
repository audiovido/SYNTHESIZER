#!/usr/bin/env python3
"""Generates native/ios/Tabriz.xcodeproj/project.pbxproj (no Mac tools needed).
Run: python3 native/tools/make_xcodeproj.py"""
import hashlib, os

def oid(name):  # stable 24-hex object ids
    return hashlib.md5(name.encode()).hexdigest()[:24].upper()

SOURCES = ["TabrizApp.swift", "ContentView.swift", "Controls.swift", "Panel.swift", "SynthModel.swift", "KeyboardView.swift", "SynthEngine.mm"]
HEADERS = ["SynthEngine.h", "Tabriz-Bridging-Header.h"]
RESOURCES = ["presets.json", "panel.json"]
FTYPE = {".swift": "sourcecode.swift", ".mm": "sourcecode.cpp.objcpp", ".h": "sourcecode.c.h", ".json": "text.json"}

o = []
w = o.append
files = SOURCES + HEADERS + RESOURCES
w("// !$*UTF8*$!\n{\n\tarchiveVersion = 1;\n\tclasses = {\n\t};\n\tobjectVersion = 56;\n\tobjects = {\n")

w("\n/* Begin PBXBuildFile section */\n")
for f in SOURCES:
    w(f"\t\t{oid('bf'+f)} /* {f} in Sources */ = {{isa = PBXBuildFile; fileRef = {oid('fr'+f)} /* {f} */; }};\n")
for f in RESOURCES:
    w(f"\t\t{oid('bf'+f)} /* {f} in Resources */ = {{isa = PBXBuildFile; fileRef = {oid('fr'+f)} /* {f} */; }};\n")
w(f"\t\t{oid('bfAVF')} /* AVFoundation.framework in Frameworks */ = {{isa = PBXBuildFile; fileRef = {oid('frAVF')} /* AVFoundation.framework */; }};\n")
w("/* End PBXBuildFile section */\n")

w("\n/* Begin PBXFileReference section */\n")
for f in files:
    t = FTYPE[os.path.splitext(f)[1]]
    w(f"\t\t{oid('fr'+f)} /* {f} */ = {{isa = PBXFileReference; lastKnownFileType = {t}; path = \"{f}\"; sourceTree = \"<group>\"; }};\n")
w(f"\t\t{oid('frAVF')} /* AVFoundation.framework */ = {{isa = PBXFileReference; lastKnownFileType = wrapper.framework; name = AVFoundation.framework; path = System/Library/Frameworks/AVFoundation.framework; sourceTree = SDKROOT; }};\n")
w(f"\t\t{oid('frApp')} /* Tabriz.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Tabriz.app; sourceTree = BUILT_PRODUCTS_DIR; }};\n")
w("/* End PBXFileReference section */\n")

w("\n/* Begin PBXFrameworksBuildPhase section */\n")
w(f"\t\t{oid('phFw')} /* Frameworks */ = {{\n\t\t\tisa = PBXFrameworksBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n\t\t\t\t{oid('bfAVF')} /* AVFoundation.framework in Frameworks */,\n\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t}};\n")
w("/* End PBXFrameworksBuildPhase section */\n")

w("\n/* Begin PBXGroup section */\n")
w(f"\t\t{oid('gMain')} = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{oid('gTabriz')} /* Tabriz */,\n\t\t\t\t{oid('gFw')} /* Frameworks */,\n\t\t\t\t{oid('gProducts')} /* Products */,\n\t\t\t);\n\t\t\tsourceTree = \"<group>\";\n\t\t}};\n")
w(f"\t\t{oid('gTabriz')} /* Tabriz */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n" + "".join(f"\t\t\t\t{oid('fr'+f)} /* {f} */,\n" for f in files) + "\t\t\t);\n\t\t\tpath = Tabriz;\n\t\t\tsourceTree = \"<group>\";\n\t\t};\n")
w(f"\t\t{oid('gFw')} /* Frameworks */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{oid('frAVF')} /* AVFoundation.framework */,\n\t\t\t);\n\t\t\tname = Frameworks;\n\t\t\tsourceTree = \"<group>\";\n\t\t}};\n")
w(f"\t\t{oid('gProducts')} /* Products */ = {{\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n\t\t\t\t{oid('frApp')} /* Tabriz.app */,\n\t\t\t);\n\t\t\tname = Products;\n\t\t\tsourceTree = \"<group>\";\n\t\t}};\n")
w("/* End PBXGroup section */\n")

w("\n/* Begin PBXNativeTarget section */\n")
w(f"""\t\t{oid('target')} /* Tabriz */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {oid('clTarget')} /* Build configuration list for PBXNativeTarget "Tabriz" */;
\t\t\tbuildPhases = (
\t\t\t\t{oid('phSrc')} /* Sources */,
\t\t\t\t{oid('phFw')} /* Frameworks */,
\t\t\t\t{oid('phRes')} /* Resources */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = Tabriz;
\t\t\tproductName = Tabriz;
\t\t\tproductReference = {oid('frApp')} /* Tabriz.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
""")
w("/* End PBXNativeTarget section */\n")

w("\n/* Begin PBXProject section */\n")
w(f"""\t\t{oid('project')} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{oid('target')} = {{
\t\t\t\t\t\tCreatedOnToolsVersion = 15.0;
\t\t\t\t\t}};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {oid('clProject')} /* Build configuration list for PBXProject "Tabriz" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {oid('gMain')};
\t\t\tproductRefGroup = {oid('gProducts')} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{oid('target')} /* Tabriz */,
\t\t\t);
\t\t}};
""")
w("/* End PBXProject section */\n")

w("\n/* Begin PBXResourcesBuildPhase section */\n")
w(f"\t\t{oid('phRes')} /* Resources */ = {{\n\t\t\tisa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n" + "".join(f"\t\t\t\t{oid('bf'+f)} /* {f} in Resources */,\n" for f in RESOURCES) + "\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n")
w("/* End PBXResourcesBuildPhase section */\n")

w("\n/* Begin PBXSourcesBuildPhase section */\n")
w(f"\t\t{oid('phSrc')} /* Sources */ = {{\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n" + "".join(f"\t\t\t\t{oid('bf'+f)} /* {f} in Sources */,\n" for f in SOURCES) + "\t\t\t);\n\t\t\trunOnlyForDeploymentPostprocessing = 0;\n\t\t};\n")
w("/* End PBXSourcesBuildPhase section */\n")

def settings(d):
    out = ""
    for k in sorted(d):
        v = d[k]
        if isinstance(v, list):
            out += f"\t\t\t\t{k} = (\n" + "".join(f"\t\t\t\t\t\"{x}\",\n" for x in v) + "\t\t\t\t);\n"
        else:
            sv = str(v)
            if not sv.replace("_", "").replace(".", "").isalnum() or sv == "":
                sv = '"' + sv.replace('"', '\\"') + '"'
            out += f"\t\t\t\t{k} = {sv};\n"
    return out

proj_common = {
    "ALWAYS_SEARCH_USER_PATHS": "NO", "CLANG_CXX_LANGUAGE_STANDARD": "gnu++17", "CLANG_CXX_LIBRARY": "libc++",
    "CLANG_ENABLE_MODULES": "YES", "CLANG_ENABLE_OBJC_ARC": "YES", "COPY_PHASE_STRIP": "NO",
    "ENABLE_STRICT_OBJC_MSGSEND": "YES", "GCC_C_LANGUAGE_STANDARD": "gnu11", "IPHONEOS_DEPLOYMENT_TARGET": "16.0",
    "SDKROOT": "iphoneos", "SWIFT_VERSION": "5.0", "CLANG_WARN_DOCUMENTATION_COMMENTS": "NO",
}
proj_debug = dict(proj_common, DEBUG_INFORMATION_FORMAT="dwarf", ENABLE_TESTABILITY="YES", ONLY_ACTIVE_ARCH="YES",
                  SWIFT_ACTIVE_COMPILATION_CONDITIONS="DEBUG", SWIFT_OPTIMIZATION_LEVEL="-Onone",
                  GCC_OPTIMIZATION_LEVEL="3")
proj_release = dict(proj_common, DEBUG_INFORMATION_FORMAT="dwarf-with-dsym", ENABLE_NS_ASSERTIONS="NO",
                    SWIFT_COMPILATION_MODE="wholemodule", SWIFT_OPTIMIZATION_LEVEL="-O", VALIDATE_PRODUCT="YES",
                    GCC_OPTIMIZATION_LEVEL="3")
target = {
    "CODE_SIGN_STYLE": "Automatic", "CURRENT_PROJECT_VERSION": "1", "DEVELOPMENT_TEAM": "",
    "GENERATE_INFOPLIST_FILE": "YES", "HEADER_SEARCH_PATHS": ["$(inherited)", "$(SRCROOT)/../dsp"],
    "INFOPLIST_KEY_CFBundleDisplayName": "Tabriz", "INFOPLIST_KEY_UIApplicationSceneManifest_Generation": "YES",
    "INFOPLIST_KEY_UILaunchScreen_Generation": "YES", "INFOPLIST_KEY_UIRequiresFullScreen": "YES",
    "INFOPLIST_KEY_UIStatusBarHidden": "YES",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone": "UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight UIInterfaceOrientationPortrait",
    "INFOPLIST_KEY_UISupportedInterfaceOrientations_iPad": "UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown",
    "LD_RUNPATH_SEARCH_PATHS": ["$(inherited)", "@executable_path/Frameworks"], "MARKETING_VERSION": "0.1",
    "PRODUCT_BUNDLE_IDENTIFIER": "com.audiovido.tabriz", "PRODUCT_NAME": "$(TARGET_NAME)",
    "SWIFT_EMIT_LOC_STRINGS": "NO", "SWIFT_OBJC_BRIDGING_HEADER": "Tabriz/Tabriz-Bridging-Header.h",
    "TARGETED_DEVICE_FAMILY": "1,2",
}

w("\n/* Begin XCBuildConfiguration section */\n")
for name, cfg, s in [("pDebug", "Debug", proj_debug), ("pRelease", "Release", proj_release),
                     ("tDebug", "Debug", target), ("tRelease", "Release", target)]:
    w(f"\t\t{oid(name)} /* {cfg} */ = {{\n\t\t\tisa = XCBuildConfiguration;\n\t\t\tbuildSettings = {{\n{settings(s)}\t\t\t}};\n\t\t\tname = {cfg};\n\t\t}};\n")
w("/* End XCBuildConfiguration section */\n")

w("\n/* Begin XCConfigurationList section */\n")
for lst, kind, a, b in [("clProject", 'PBXProject "Tabriz"', "pDebug", "pRelease"),
                        ("clTarget", 'PBXNativeTarget "Tabriz"', "tDebug", "tRelease")]:
    w(f"\t\t{oid(lst)} /* Build configuration list for {kind} */ = {{\n\t\t\tisa = XCConfigurationList;\n\t\t\tbuildConfigurations = (\n\t\t\t\t{oid(a)} /* Debug */,\n\t\t\t\t{oid(b)} /* Release */,\n\t\t\t);\n\t\t\tdefaultConfigurationIsVisible = 0;\n\t\t\tdefaultConfigurationName = Release;\n\t\t}};\n")
w("/* End XCConfigurationList section */\n")

w(f"\t}};\n\trootObject = {oid('project')} /* Project object */;\n}}\n")
here = os.path.dirname(os.path.abspath(__file__))
dst = os.path.join(here, "..", "ios", "Tabriz.xcodeproj", "project.pbxproj")
open(dst, "w").write("".join(o))
print("wrote", os.path.normpath(dst))
