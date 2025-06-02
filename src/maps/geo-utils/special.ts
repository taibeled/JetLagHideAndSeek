export const lngLatToText = (coordinates: [number, number]) => {
    /**
     * @param coordinates - Should be in longitude, latitude order
     */
    return `${Math.abs(coordinates[1])}°${coordinates[1] > 0 ? "N" : "S"}, ${Math.abs(coordinates[0])}°${coordinates[0] > 0 ? "E" : "W"}`;
};

export const groupObjects = (objects: any[]): any[][] => {
    const filteredObjects = objects.filter(
        (obj) =>
            obj.properties.name !== undefined ||
            obj.properties["name:en"] !== undefined ||
            obj.properties.network !== undefined,
    );

    const n = filteredObjects.length;
    const parent: number[] = Array.from({ length: n }, (_, i) => i);

    const find = (i: number): number => {
        if (parent[i] !== i) {
            parent[i] = find(parent[i]);
        }
        return parent[i];
    };

    const union = (i: number, j: number): void => {
        const rootI = find(i);
        const rootJ = find(j);
        if (rootI !== rootJ) {
            parent[rootJ] = rootI;
        }
    };

    const keys = ["name", "name:en", "network"];
    const paramMap: Record<string, number> = {};

    for (let i = 0; i < n; i++) {
        const obj = filteredObjects[i];
        for (const key of keys) {
            const value = obj.properties[key];
            if (value !== undefined) {
                const mapKey = `${key}:${value}`;
                if (paramMap[mapKey] === undefined) {
                    paramMap[mapKey] = i;
                } else {
                    union(i, paramMap[mapKey]);
                }
            }
        }
    }

    const groups: Record<number, any[]> = {};
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!groups[root]) {
            groups[root] = [];
        }
        groups[root].push(filteredObjects[i]);
    }
    return Object.values(groups);
};

const naiveDistance = (
    point1: [number, number],
    point2: [number, number],
): number => {
    const dx: number = point1[0] - point2[0];
    const dy: number = point1[1] - point2[1];
    return Math.sqrt(dx * dx + dy * dy);
};

export const connectToSeparateLines = (
    lines: [number, number][][],
    maxJumpDistance: number = 0.01,
): [number, number][][] => {
    if (lines.length <= 1) return lines.length === 1 ? [lines[0]] : [];

    const remainingLines = [...lines];
    const result: [number, number][][] = [];
    let currentLine: [number, number][] = [];

    const firstLine = remainingLines.shift()!;
    currentLine.push(...firstLine);

    while (remainingLines.length > 0) {
        const lastPoint: [number, number] = currentLine[currentLine.length - 1];

        let bestIndex: number = -1;
        let minDistance: number = Infinity;
        let shouldReverse: boolean = false;

        remainingLines.forEach((line, index) => {
            const distToStart: number = naiveDistance(lastPoint, line[0]);
            if (distToStart < minDistance) {
                minDistance = distToStart;
                bestIndex = index;
                shouldReverse = false;
            }

            const distToEnd: number = naiveDistance(
                lastPoint,
                line[line.length - 1],
            );
            if (distToEnd < minDistance) {
                minDistance = distToEnd;
                bestIndex = index;
                shouldReverse = true;
            }
        });

        let nextLine: [number, number][] = remainingLines.splice(
            bestIndex,
            1,
        )[0];

        if (shouldReverse) {
            nextLine = nextLine.slice().reverse();
        }

        if (minDistance > maxJumpDistance) {
            result.push(currentLine);
            currentLine = [...nextLine];
        } else {
            const firstPointOfNextLine: [number, number] = nextLine[0];
            if (naiveDistance(lastPoint, firstPointOfNextLine) < 0.0001) {
                currentLine.push(...nextLine.slice(1));
            } else {
                currentLine.push(...nextLine);
            }
        }
    }

    if (currentLine.length > 0) {
        result.push(currentLine);
    }

    return result;
};
