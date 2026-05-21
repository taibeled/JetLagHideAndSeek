# NativeMap Refactoring Plan

## Problem

`NativeMap.tsx` is a 685-line single-component file that owns too many
responsibilities:

1. Pin drag gesture lifecycle (long-press detection, hit-test, coordinate
   projection, draft state, commit-on-drop)
2. Derived GeoJSON computation (play-area masks, combined inside mask, active
   pin feature collection)
3. Map layer composition (9 ShapeSource/layer groups with inline style objects)
4. Map controls overlay (fit + locate buttons)
5. Event coordinate extraction (recursive `getEventCoordinate` utility tree)

Each of these grows independently as new question types, overlays, or gestures
are added. The current shape makes it hard to:

- Test gesture logic without rendering the full map
- Add a new overlay without reading 500+ lines of unrelated JSX
- Reuse coordinate parsing or map controls elsewhere

## Proposed Extraction Plan

### 1. Extract `getEventCoordinate` utilities → `src/features/map/eventCoordinate.ts`

The bottom ~55 lines (`getEventCoordinate`, `getCoordinateFromArray`, `isRecord`)
are pure functions with zero component dependencies. Move them to a standalone
module with their own unit tests. This is the safest first step since no
component boundaries change.

### 2. Extract pin drag hook → `src/features/map/usePinDrag.ts`

The entire drag workflow (lines 77–252 in the current file) forms a cohesive
unit: refs, RAF throttle, hit-test threshold, gesture object construction, and
draft coordinate state. Extract it as:

```typescript
interface PinDragState {
    isDragging: boolean;
    draftCoordinate: Position | null;
    gesture: GestureType;
}

function usePinDrag(opts: {
    mapRef: RefObject<MapView>;
    activeQuestion: RadarQuestion | null;
    canMove: boolean;
    onCommit: (questionId: string, center: Position) => void;
}): PinDragState;
```

This lets us unit-test the gesture lifecycle by mocking `mapRef.getPointInView`
and `getCoordinateFromView` without rendering any MapLibre layers.

### 3. Extract layer groups into focused components

Each logical overlay can become a small component that receives only the data it
renders. They stay as MapLibre children (no extra `View` wrappers):

| Component               | Source ids                                                                    | Data                                               |
| ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| `PlayAreaMaskLayers`    | `play-area-outside-mask-*`, `combined-inside-mask-*`                          | `playArea`, `combinedInsideMask`                   |
| `HidingZoneLayers`      | `hiding-zone-area`, `hiding-zone-routes`, `hiding-zone-stations`              | `routeFeatures`, `stationFeatures`, `zoneFeatures` |
| `RadarQuestionLayers`   | `radar-question-areas`, `radar-question-miss-mask`, `radar-question-outlines` | `questionMapRenderState.radar`                     |
| `ActivePinLayer`        | `question-active-pin`                                                         | `activePinFeature`, drag state                     |
| `PlayAreaBoundaryLayer` | `play-area-boundary-*`                                                        | `playArea.boundary`                                |

Each file is ~40–80 lines, easily scannable, and testable with the existing mock
infrastructure (assert `ShapeSource.shape` props in isolation).

### 4. Extract `MapControls` → `src/features/map/MapControls.tsx`

The `MapControl` helper and the absolutely-positioned controls `View` become a
standalone component. This already has no coupling to MapLibre internals—it just
needs `fitPlayArea`, `locateUser`, and the top inset.

### 5. Resulting `NativeMap.tsx`

After extraction, the coordinator shrinks to roughly:

```typescript
export function NativeMap({ onPress }: NativeMapProps) {
  const cameraRef = useRef<CameraHandle | null>(null);
  const mapRef = useRef<any>(null);
  const { playArea } = usePlayArea();
  const { routeFeatures, stationFeatures, zoneFeatures } = useHidingZone();
  const { questionMapRenderState, ... } = useQuestion();

  const pinDrag = usePinDrag({ mapRef, activeQuestion, canMove, onCommit });
  const masks = usePlayAreaMasks(playArea, zoneFeatures, questionMapRenderState);
  const { fitPlayArea } = useFitCamera(cameraRef, playArea);
  const userLocation = useUserLocation(cameraRef);

  const handleMapPress = useCallback(...);

  return (
    <GestureDetector gesture={pinDrag.gesture}>
      <View style={styles.container}>
        <MLMapView ...>
          <MLCamera ref={cameraRef} ... />
          <PlayAreaMaskLayers masks={masks} osmId={playArea.osmId} />
          <HidingZoneLayers routes={routeFeatures} stations={stationFeatures} zones={zoneFeatures} />
          <RadarQuestionLayers radar={questionMapRenderState.radar} onPress={handleMapPress} />
          <PlayAreaBoundaryLayer playArea={playArea} />
          {userLocation.hasPermission && <MLUserLocation ... />}
          <ActivePinLayer feature={activePinFeature} dragState={pinDrag} canMove={canMove} onPress={handleMapPress} />
        </MLMapView>
        <MapControls playArea={playArea} fitPlayArea={fitPlayArea} locateUser={userLocation.locateUser} insets={insets} />
      </View>
    </GestureDetector>
  );
}
```

~60 lines of orchestration, no inline style objects, clear data flow.

## Migration Strategy

Do it incrementally in this order to keep tests green at each step:

1. **Utilities first** – extract `eventCoordinate.ts`, add unit tests, update
   imports. Zero risk, immediate win.
2. **`usePinDrag` hook** – extract and add focused unit tests. Existing
   `NativeMap.test.tsx` assertions continue to pass unchanged.
3. **Layer components** – extract one group at a time (start with
   `HidingZoneLayers` since it's self-contained). Verify existing snapshot/prop
   assertions still hold by checking `ShapeSource` ids in the rendered tree.
4. **`MapControls`** – trivial extraction, update the E2E selectors if any
   targets change (currently emoji-text based, so they won't).
5. **Cleanup** – remove orphan styles, inline constants that are now local to
   their layer component, and delete dead code.

## Testing Notes

- Layer components can be tested in isolation: render them inside a mock
  `MapView` and assert `shape` / `style` props. This is lighter than the
  current full-provider render.
- `usePinDrag` can be tested with `renderHook` by providing a fake `mapRef`
  that resolves `getPointInView` / `getCoordinateFromView` to known screen
  points.
- The existing `NativeMap.test.tsx` becomes an integration test that verifies
  composition (all layers present, correct ordering). It should still pass
  untouched after each extraction step.

## Non-Goals

- Changing MapLibre layer ordering or z-index behavior.
- Introducing a new state management layer.
- Refactoring `questionMapRenderState` derivation (that lives in
  `questionStore` and is already separate).
- Touching E2E flows—this is an internal restructuring with no behavioral
  change.
