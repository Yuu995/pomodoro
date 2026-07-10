#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>
#import <dlfcn.h>
#import <math.h>

typedef int (*CGSMainConnectionIDFunction)(void);
typedef CFArrayRef (*CGSCopyManagedDisplaySpacesFunction)(int connection);

static NSString *managedSpaceState(BOOL debug) {
  [NSApplication sharedApplication];
  [NSApp setActivationPolicy:NSApplicationActivationPolicyProhibited];

  void *skyLight = dlopen(
    "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
    RTLD_LAZY
  );
  if (!skyLight) return @"unknown";

  CGSMainConnectionIDFunction mainConnection =
    (CGSMainConnectionIDFunction)dlsym(skyLight, "CGSMainConnectionID");
  CGSCopyManagedDisplaySpacesFunction copySpaces =
    (CGSCopyManagedDisplaySpacesFunction)dlsym(skyLight, "CGSCopyManagedDisplaySpaces");
  if (!mainConnection || !copySpaces) {
    dlclose(skyLight);
    return @"unknown";
  }

  int connection = mainConnection();
  CFArrayRef spacesRef = connection ? copySpaces(connection) : NULL;
  NSArray *displaySpaces = CFBridgingRelease(spacesRef);
  if (debug) fprintf(stderr, "connection=%d managedDisplays=%lu\n", connection, displaySpaces.count);
  if (!displaySpaces.count) {
    dlclose(skyLight);
    return @"unknown";
  }

  BOOL foundCurrentSpace = NO;
  BOOL fullscreen = NO;
  for (NSDictionary *display in displaySpaces) {
    NSDictionary *currentSpace = display[@"Current Space"];
    NSNumber *type = currentSpace[@"type"];
    if (debug) fprintf(stderr, "managedSpace type=%d\n", type.intValue);
    if (!type) continue;
    foundCurrentSpace = YES;
    if (type.intValue == 4) fullscreen = YES;
  }

  dlclose(skyLight);
  if (!foundCurrentSpace) return @"unknown";
  return fullscreen ? @"fullscreen" : @"normal";
}

static BOOL rectMatchesDisplay(CGRect windowBounds, CGRect displayBounds) {
  const CGFloat tolerance = 3.0;
  return fabs(CGRectGetMinX(windowBounds) - CGRectGetMinX(displayBounds)) <= tolerance &&
         fabs(CGRectGetMinY(windowBounds) - CGRectGetMinY(displayBounds)) <= tolerance &&
         fabs(CGRectGetWidth(windowBounds) - CGRectGetWidth(displayBounds)) <= tolerance &&
         fabs(CGRectGetHeight(windowBounds) - CGRectGetHeight(displayBounds)) <= tolerance;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    BOOL debug = argc > 1 && strcmp(argv[1], "--debug") == 0;
    NSString *spaceState = managedSpaceState(debug);
    if (![spaceState isEqualToString:@"unknown"]) {
      puts(spaceState.UTF8String);
      return 0;
    }

    NSRunningApplication *frontApp = NSWorkspace.sharedWorkspace.frontmostApplication;
    CFArrayRef windowInfoRef = CGWindowListCopyWindowInfo(
      kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
      kCGNullWindowID
    );
    NSArray *windowInfo = CFBridgingRelease(windowInfoRef);

    uint32_t displayCount = 0;
    CGGetActiveDisplayList(0, NULL, &displayCount);
    CGDirectDisplayID *displays = calloc(displayCount, sizeof(CGDirectDisplayID));
    if (!displays) {
      puts("unknown");
      return 0;
    }
    CGGetActiveDisplayList(displayCount, displays, &displayCount);
    if (debug) {
      fprintf(stderr, "front=%s pid=%d\n",
              frontApp ? frontApp.localizedName.UTF8String : "unknown",
              frontApp ? frontApp.processIdentifier : 0);
      for (uint32_t i = 0; i < displayCount; i++) {
        CGRect bounds = CGDisplayBounds(displays[i]);
        fprintf(stderr, "display[%u]=%.0f,%.0f %.0fx%.0f\n", i,
                bounds.origin.x, bounds.origin.y, bounds.size.width, bounds.size.height);
      }
    }

    BOOL fullscreen = NO;
    for (NSDictionary *window in windowInfo) {
      if ([window[(id)kCGWindowLayer] intValue] != 0) continue;

      CGRect windowBounds = CGRectZero;
      if (!CGRectMakeWithDictionaryRepresentation(
            (__bridge CFDictionaryRef)window[(id)kCGWindowBounds],
            &windowBounds)) continue;
      if (debug) {
        fprintf(stderr, "window owner=%s layer=%d bounds=%.0f,%.0f %.0fx%.0f\n",
                [window[(id)kCGWindowOwnerName] UTF8String],
                [window[(id)kCGWindowLayer] intValue],
                windowBounds.origin.x, windowBounds.origin.y,
                windowBounds.size.width, windowBounds.size.height);
      }

      for (uint32_t i = 0; i < displayCount; i++) {
        if (rectMatchesDisplay(windowBounds, CGDisplayBounds(displays[i]))) {
          fullscreen = YES;
          break;
        }
      }
      if (fullscreen) break;
    }

    free(displays);
    puts(fullscreen ? "fullscreen" : "normal");
  }
  return 0;
}
