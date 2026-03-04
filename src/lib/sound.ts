import { soundEnabled } from "@/lib/context";

export function playSound(type: "notification" | "question" | "answer"): void {
    if (!soundEnabled.get()) return;
    try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value =
            type === "notification" ? 440 : type === "question" ? 660 : 880;
        gain.gain.value = 0.15;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch {
        /* silent fail */
    }
}
