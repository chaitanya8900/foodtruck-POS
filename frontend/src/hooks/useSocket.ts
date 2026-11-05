import { useEffect, useRef } from 'react';
import useSocketStore from '@/store/socket';
import useAuthStore from '@/store/auth';

export function useSocket() {
  const { socket, isConnected, connect, disconnect } = useSocketStore();
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated && token) {
      connect(token);
    } else {
      // Connect without auth token for public updates if needed
      connect();
    }

    return () => {
      // Keep socket open or disconnect on unmount
    };
  }, [isAuthenticated, token, connect]);

  return {
    socket,
    isConnected,
    connect,
    disconnect,
  };
}

export function useSocketEvent<T = unknown>(eventName: string, handler: (data: T) => void) {
  const { socket, connect } = useSocketStore();
  const token = useAuthStore((state) => state.token);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) {
      connect(token || undefined);
    }
  }, [socket, token, connect]);

  useEffect(() => {
    if (!socket) return;

    const eventListener = (data: T) => {
      handlerRef.current(data);
    };

    socket.on(eventName, eventListener);

    return () => {
      socket.off(eventName, eventListener);
    };
  }, [socket, eventName]);
}

export default useSocket;
