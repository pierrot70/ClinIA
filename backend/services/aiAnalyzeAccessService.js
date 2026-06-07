export function resolveAnalyzeExecutionMode({
    authUser,
    forceMock,
    mockEnabled,
    forceReal,
}) {
    const authenticated = Boolean(authUser?.userId);
    const forceRealSafe =
        authenticated && forceMock !== true && forceReal === true;

    return {
        authenticated,
        forceRealSafe,
        useMock:
            !authenticated ||
            ((forceMock === true || mockEnabled === true) && !forceRealSafe),
    };
}
