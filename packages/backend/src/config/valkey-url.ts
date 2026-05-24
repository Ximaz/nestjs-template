export interface ValkeyConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
}

export function parseValkeyUrl(input: string): ValkeyConnectionOptions {
  const url = new URL(input);
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname ? Number(url.pathname.replace('/', '')) || 0 : 0,
  };
}
