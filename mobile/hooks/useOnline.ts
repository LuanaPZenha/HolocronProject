import { useEffect, useState } from 'react';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

function conectado(estado: NetInfoState): boolean {
  return estado.isConnected !== false;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let vivo = true;
    const aplicar = (estado: NetInfoState) => {
      if (vivo) {
        setOnline(conectado(estado));
      }
    };
    const cancelar = NetInfo.addEventListener(aplicar);
    void NetInfo.fetch().then(aplicar);
    return () => {
      vivo = false;
      cancelar();
    };
  }, []);

  return online;
}
