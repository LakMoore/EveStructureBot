export interface EveServerStatus {
  players: number;
  server_version: string;
  start_time: string;
  vip?: boolean;
}

export async function getEveServerStatus(): Promise<EveServerStatus> {
  const response = await fetch('https://esi.evetech.net/status');
  if (!response.ok) {
    throw new Error(
      `Failed to fetch EVE server status: ${response.statusText}`
    );
  }
  const data: EveServerStatus = await response.json();
  return data;
}
