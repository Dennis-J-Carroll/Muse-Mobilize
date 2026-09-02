export async function providerHttpError(label: string, response: Response): Promise<Error> {
  if (response.status === 401 || response.status === 403) {
    return new Error(`${label} rejected API key. Replace it in Settings, then run connection check again.`);
  }
  if (response.status === 404) {
    return new Error(`${label} could not find selected model. Choose a listed model in Settings.`);
  }
  if (response.status === 429) {
    return new Error(`${label} rate limit or credit limit reached. Check vendor billing and retry shortly.`);
  }
  if (response.status >= 500) {
    return new Error(`${label} service is temporarily unavailable. Retry shortly.`);
  }
  const body = await response.text();
  return new Error(`${label} ${response.status}: ${body.slice(0, 400)}`);
}
