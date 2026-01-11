// backend/utils/openaiCircuitBreaker.js

const breaker = {
    failures: 0,
    lastFailureAt: 0,
    state: "CLOSED", // CLOSED | OPEN | HALF_OPEN
};

const MAX_FAILURES = 3;          // seuil avant ouverture
const COOLDOWN_MS = 60_000;      // 1 minute
const HALF_OPEN_TRIALS = 1;      // 1 tentative

export function canCallOpenAI() {
    if (breaker.state === "OPEN") {
        const elapsed = Date.now() - breaker.lastFailureAt;

        if (elapsed > COOLDOWN_MS) {
            breaker.state = "HALF_OPEN";
            breaker.failures = 0;
            return true;
        }
        return false;
    }

    return true;
}

export function recordOpenAISuccess() {
    breaker.failures = 0;
    breaker.state = "CLOSED";
}

export function recordOpenAIFailure() {
    breaker.failures += 1;
    breaker.lastFailureAt = Date.now();

    if (breaker.failures >= MAX_FAILURES) {
        breaker.state = "OPEN";
        console.warn("🚨 OPENAI CIRCUIT OPENED");
    }
}

export function getCircuitState() {
    return breaker.state;
}
