export type Position = [number, number];

export type Bbox = [number, number, number, number];

export function bboxIntersects(a: Bbox, b: Bbox): boolean {
    const [aWest, aSouth, aEast, aNorth] = a;
    const [bWest, bSouth, bEast, bNorth] = b;
    return !(
        aEast < bWest ||
        bEast < aWest ||
        aNorth < bSouth ||
        bNorth < aSouth
    );
}
