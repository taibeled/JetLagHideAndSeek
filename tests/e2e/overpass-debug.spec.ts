import { test } from "@playwright/test";

test("debug overpass 400 queries", async ({ page }) => {
    const overpass400: string[] = [];

    page.on("response", async (response) => {
        const url = response.url();
        if (!url.includes("overpass") || !url.includes("interpreter")) return;
        if (response.status() !== 400) return;

        const request = response.request();
        const postData = request.postData() ?? "";
        const rawData = postData.startsWith("data=")
            ? postData.slice(5)
            : (new URL(url).searchParams.get("data") ?? "");
        const decoded = decodeURIComponent(rawData);
        overpass400.push(decoded);
        console.log("=== OVERPASS 400 QUERY START ===");
        console.log(decoded);
        console.log("=== OVERPASS 400 QUERY END ===");
    });

    await page.goto("/JetLagHideAndSeek");
    await page.waitForLoadState("networkidle");

    const addQuestion = page.getByRole("button", { name: "Add Question" });
    if (await addQuestion.isVisible()) {
        await addQuestion.click();
    }

    const matchingType = page.getByText("Matching Type").first();
    if (await matchingType.isVisible()) {
        await matchingType.click();
        const sameTrain = page.getByRole("option", {
            name: /Station On Same Train Line Question/i,
        });
        if (await sameTrain.isVisible()) {
            await sameTrain.click();
        }
    }

    const openHidingZones = page.getByRole("button", {
        name: "Open Hiding Zones",
    });
    if (await openHidingZones.isVisible()) {
        await openHidingZones.click();
    }

    await page.waitForTimeout(8000);
    console.log(`Overpass 400 count: ${overpass400.length}`);

    const parserProbe = `
[out:json][timeout:120][maxsize:536870912];
node(42427866)->.originNodes;
way(bn.originNodes)->.nodeWays;
(
  rel(bn.originNodes)["type"="route"]["route"~"^(subway|light_rail|train|tram|monorail|funicular)$"];
  rel(bw.originWays)["type"="route"]["route"~"^(subway|light_rail|train|tram|monorail|funicular)$"];
  rel(br.originRel)["type"="route"]["route"~"^(subway|light_rail|train|tram|monorail|funicular)$"];
  rel(bw.nodeWays)["type"="route"]["route"~"^(subway|light_rail|train|tram|monorail|funicular)$"];
);
->.routes;
(.routes;>;);
out tags;
`;
    const parserProbeResult = await page.request.post(
        "https://overpass-api.de/api/interpreter",
        {
            form: {
                data: parserProbe,
            },
        },
    );
    const parserProbeText = await parserProbeResult.text();
    console.log(`Probe status: ${parserProbeResult.status()}`);
    console.log(parserProbeText.slice(0, 500));
});
