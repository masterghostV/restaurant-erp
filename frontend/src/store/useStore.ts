import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  restaurantId: string | null;
  staffId: string | null;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  type: string;
  createdAt: string;
}

interface RestaurantOption {
  id: string;
  name: string;
}

interface AppState {
  user: User | null;
  token: string | null;
  notifications: Notification[];
  socket: Socket | null;
  theme: 'light' | 'dark';
  // Super Admin isn't tied to one restaurant by default. This lets them
  // pick which restaurant's operational panels (POS, Kitchen, Inventory,
  // etc.) they're currently acting as manager of.
  activeRestaurantId: string | null;
  restaurantList: RestaurantOption[];
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  setTheme: (theme: 'light' | 'dark') => void;
  addNotification: (notif: Notification) => void;
  setNotifications: (notifs: Notification[]) => void;
  fetchNotifications: () => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  fetchRestaurantList: () => Promise<void>;
  setActiveRestaurantId: (id: string) => void;
  connectSocket: () => void;
  disconnectSocket: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('erp_user') || 'null') : null,
  token: typeof window !== 'undefined' ? localStorage.getItem('erp_token') : null,
  notifications: [],
  socket: null,
  theme: typeof window !== 'undefined' ? (localStorage.getItem('erp_theme') as 'light' | 'dark' || 'dark') : 'dark',
  activeRestaurantId: typeof window !== 'undefined' ? localStorage.getItem('erp_active_restaurant') : null,
  restaurantList: [],

  setAuth: (user, token) => {
    localStorage.setItem('erp_user', JSON.stringify(user));
    localStorage.setItem('erp_token', token);
    set({ user, token });
    get().connectSocket();
  },

  clearAuth: () => {
    localStorage.removeItem('erp_user');
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_active_restaurant');
    localStorage.removeItem('erp_demo_expires_at');
    get().disconnectSocket();
    set({ user: null, token: null, notifications: [], activeRestaurantId: null, restaurantList: [] });
  },

  setTheme: (theme) => {
    localStorage.setItem('erp_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },

  addNotification: (notif) => {
    set((state) => ({ notifications: [notif, ...state.notifications] }));
  },

  setNotifications: (notifications) => set({ notifications }),

  // Loads notification history from the backend. The backend itself
  // decides scope: regular users only get notifications addressed to
  // them, while SUPER_ADMIN gets every notification across the platform.
  fetchNotifications: async () => {
    const { token } = get();
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      set({ notifications: data });
    } catch (err) {
      console.error('Failed to fetch notifications', err);
    }
  },

  markAllNotificationsRead: async () => {
    const { token, notifications } = get();
    if (!token) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/notifications/read-all`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      set({ notifications: notifications.map((n) => ({ ...n, isRead: true })) });
    } catch (err) {
      console.error('Failed to mark notifications as read', err);
    }
  },

  // Only ever needed for Super Admin, who isn't tied to one restaurant and
  // needs to pick which outlet's operational panels to act on. Also
  // auto-selects the first restaurant if none is chosen yet, so Super
  // Admin's panels work immediately without extra clicks.
  fetchRestaurantList: async () => {
    const { token, user, activeRestaurantId } = get();
    if (!token || user?.role !== 'SUPER_ADMIN') return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    try {
      const res = await fetch(`${apiUrl}/restaurants`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const list = data.map((r: any) => ({ id: r.id, name: r.name }));
      set({ restaurantList: list });

      if (!activeRestaurantId && list.length > 0) {
        get().setActiveRestaurantId(list[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch restaurant list', err);
    }
  },

  setActiveRestaurantId: (id) => {
    localStorage.setItem('erp_active_restaurant', id);
    set({ activeRestaurantId: id });
    // The Site Owner belongs to no restaurant, so live updates only flow for
    // the one they're currently looking at. Tell the server when it changes.
    const { socket, user } = get();
    if (socket && socket.connected && user?.role === 'SUPER_ADMIN') {
      socket.emit('watchRestaurant', id);
    }
  },

  connectSocket: () => {
    const { token, user, socket } = get();
    if (!token || !user) return;
    if (socket && socket.connected) return;

    // Disconnect old socket
    if (socket) socket.disconnect();

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';
    const newSocket = io(socketUrl, {
      transports: ['websocket'],
      auth: { token },
    });

    newSocket.on('connect', () => {
      console.log('Real-time Socket.IO connected');
      // Fallback join in case the server couldn't authenticate the
      // handshake token (e.g. token missing/expired at connect time).
      newSocket.emit('join', user.id);
      const watching = get().activeRestaurantId;
      if (user.role === 'SUPER_ADMIN' && watching) {
        newSocket.emit('watchRestaurant', watching);
      }
    });

    // The server now only ever emits 'notification' to this user's private
    // room, so there's no need (and no risk of leaking other users' data)
    // to also listen for a global/broadcast notification channel.
    newSocket.on('notification', (notif: Notification) => {
      get().addNotification(notif);
    });

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },
}));
