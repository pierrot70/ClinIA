export const PASSWORD_VERIFICATION_DELAY_MS = 1000;

const wait = () => new Promise(resolve => setTimeout(resolve, PASSWORD_VERIFICATION_DELAY_MS));

// Non-blocking waits: never busy-wait on the Node.js event loop.
// Same extra delay for success, MFA challenge, invalid credentials and errors.
// Call only after the request's authentication/rate-limit guards have passed.
export async function withPasswordVerificationDelay(operation) {
    await wait();
    try {
        return await operation();
    } finally {
        await wait();
    }
}
