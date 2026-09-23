import { ApiClient } from '@applyai/api-client';
import { apiBaseURL } from './api-client';

/** The Admin Console may use only the typed workspace API client. */
export const adminApiClient = new ApiClient(apiBaseURL, { client: 'browser' });
