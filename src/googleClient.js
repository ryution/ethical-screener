// PlainStreet's Google sign-in client ID. It is public by design: Google's button needs it
// in the page. It lives here so the page has it the moment the sign-in pop-up opens,
// instead of waiting on a server round trip, and the server checks tokens against the same value.
export const DEFAULT_GOOGLE_CLIENT_ID = "1085970294005-t3oohllhj901iprj8dgrogsqlf6r78so.apps.googleusercontent.com";
