// Codex's Linux sandbox (`codex exec --sandbox workspace-write`) sets this. Inside it, child Node processes return
// empty output, and WSL interop (kdec.exe) and sockets fail, so tests that need them skip there; the orchestrator
// runs the full suite outside the sandbox before every commit.
export const inCodexSandbox = process.env.CODEX_SANDBOX_NETWORK_DISABLED === '1';
