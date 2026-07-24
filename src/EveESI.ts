export interface EveServerStatus {
  players: number;
  server_version: string;
  start_time: string;
  vip?: boolean;
}

export async function getEveServerStatus(): Promise<EveServerStatus> {
  try {
    const response = await fetch('https://esi.evetech.net/status');
    if (response.ok) {
      const data: EveServerStatus = await response.json();
      return data;
    }
  }
  catch {
    // do nothing if the request fails, just return a "server offline" status
  }
  return {
    players: 0,
    server_version: '',
    start_time: '',
  };
}
