import { createClient } from '@base44/sdk';

// Initialize the client. 
// In a real app, you might pass config, but for now we assume defaults or env vars are picked up if available.
// If the SDK requires parameters, they should be added here.
export const base44 = createClient();
