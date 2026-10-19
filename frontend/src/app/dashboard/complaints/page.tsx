'use intelligence';
'use client';

import { useEffect, useState } from 'react';
import { useStore } from '../../../store/useStore';
import { AlertCircle, MessageSquare, CheckSquare, Plus, Send } from 'lucide-react';

interface Comment {
  id: string;
  comment: string;
  createdAt: string;
  user: { name: string };
}

interface Complaint {
  id: string;
  category: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  reporter: { name: string };
  resolvedBy?: { name: string } | null;
  resolutionNotes?: string | null;
  comments?: Comment[];
}

export default function ComplaintsPanel() {
  const { user, token, socket } = useStore();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Complaint | null>(null);

  // Modals
  const [showFileModal, setShowFileModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);

  // Form states
  const [category, setCategory] = useState('Hygiene');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('MEDIUM');

  const [resNotes, setResNotes] = useState('');
  const [commentText, setCommentText] = useState('');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/+$/, '');

  const fetchTickets = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiUrl}/complaints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setComplaints(await res.json());
    } catch (err) {
      setError('Error pulling complaint logs');
    } finally {
      setLoading(false);
    }
  };

  const fetchTicketDetails = async (id: string) => {
    try {
      const res = await fetch(`${apiUrl}/complaints/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTicket(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [token, apiUrl]);

  // Real-time updates
  useEffect(() => {
    if (!socket) return;

    socket.on('complaintUpdate', (updated: Complaint) => {
      setComplaints((prev) => {
        const idx = prev.findIndex((c) => c.id === updated.id);
        if (idx !== -1) {
          const next = [...prev];
          next[idx] = updated;
          return next;
        }
        return [updated, ...prev];
      });

      setSelectedTicket((prev) => (prev?.id === updated.id ? updated : prev));
    });

    return () => {
      socket.off('complaintUpdate');
    };
  }, [socket]);

  const fileComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const payload = {
      category,
      title,
      description,
      priority,
      reporterId: user?.id,
    };

    try {
      const res = await fetch(`${apiUrl}/complaints`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to lodge ticket');

      setSuccess('Complaint ticket logged successfully!');
      setShowFileModal(false);
      setTitle('');
      setDescription('');
      fetchTickets();
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !commentText.trim()) return;

    try {
      const res = await fetch(`${apiUrl}/complaints/${selectedTicket.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: user?.id, comment: commentText }),
      });

      if (res.ok) {
        setCommentText('');
        fetchTicketDetails(selectedTicket.id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket) return;

    try {
      const res = await fetch(`${apiUrl}/complaints/${selectedTicket.id}/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ resolvedById: user?.id, resolutionNotes: resNotes }),
      });

      if (res.ok) {
        setSuccess('Ticket resolved successfully!');
        setShowResolveModal(false);
        setResNotes('');
        fetchTicketDetails(selectedTicket.id);
        setTimeout(() => setSuccess(''), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-xs text-slate-400">Loading Complaint Station...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Complaints & Feedback</h1>
          <p className="text-slate-400 text-sm mt-0.5">Submit operational grievances or review outstanding staff tickets</p>
        </div>

        <button
          onClick={() => setShowFileModal(true)}
          className="px-3.5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow shadow-indigo-600/10"
        >
          <Plus className="h-4 w-4" /> Log Complaint
        </button>
      </div>

      {success && (
        <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-semibold">
          {success}
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-lg border border-rose-500/20 bg-red-500/10 text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Tickets List */}
        <div className="lg:col-span-7 p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-450 font-semibold uppercase tracking-wider">
                  <th className="pb-3">Title / Grievance</th>
                  <th className="pb-3">Category</th>
                  <th className="pb-3">Priority</th>
                  <th className="pb-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {complaints.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => fetchTicketDetails(ticket.id)}
                    className="hover:bg-slate-800/20 cursor-pointer"
                  >
                    <td className="py-4">
                      <div className="font-bold text-white">{ticket.title}</div>
                      <div className="text-[10px] text-slate-500">Filed by {ticket.reporter.name}</div>
                    </td>
                    <td className="py-4">{ticket.category}</td>
                    <td className="py-4 font-semibold text-slate-400">{ticket.priority}</td>
                    <td className="py-4 text-right">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        ticket.status === 'RESOLVED'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                          : ticket.status === 'IN_PROGRESS'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                          : 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {complaints.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-slate-500">No complaints logged yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Grievance Detail Drawer & Comments feed */}
        <div className="lg:col-span-5">
          {!selectedTicket ? (
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur text-center text-xs text-slate-500 py-16">
              Select a ticket from the ledger to inspect comments and resolutions.
            </div>
          ) : (
            <div className="p-6 rounded-xl border border-slate-800 bg-slate-900/40 backdrop-blur space-y-6">
              
              {/* Title Header */}
              <div className="space-y-2 border-b border-slate-850 pb-4">
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-base text-white">{selectedTicket.title}</h3>
                  <span className="px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-950 text-slate-400">
                    {selectedTicket.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{selectedTicket.description}</p>
                <div className="text-[10px] text-slate-500">
                  Reported by: {selectedTicket.reporter.name} • {new Date(selectedTicket.createdAt).toLocaleDateString()}
                </div>
              </div>

              {/* Resolution details */}
              {selectedTicket.status === 'RESOLVED' ? (
                <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-xs text-slate-300 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-white">
                    <CheckSquare className="h-4 w-4 text-emerald-400" /> Resolved by {selectedTicket.resolvedBy?.name}
                  </div>
                  <p className="text-[11px] text-slate-400 italic">Notes: {selectedTicket.resolutionNotes}</p>
                </div>
              ) : (
                (user?.role === 'SUPER_ADMIN' || user?.role === 'OWNER') && (
                  <button
                    onClick={() => setShowResolveModal(true)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow shadow-emerald-600/10"
                  >
                    <CheckSquare className="h-4 w-4" /> Mark Grievance Resolved
                  </button>
                )
              )}

              {/* Comments Feed */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 text-indigo-400" /> Discussion Board
                </h4>

                <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
                  {selectedTicket.comments?.map((c) => (
                    <div key={c.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-850 text-xs">
                      <div className="flex justify-between font-bold text-white mb-0.5">
                        <span>{c.user.name}</span>
                        <span className="text-[9px] text-slate-500 font-normal">
                          {new Date(c.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-slate-400 leading-relaxed">{c.comment}</p>
                    </div>
                  ))}
                  {selectedTicket.comments?.length === 0 && (
                    <p className="text-[10px] text-slate-550 py-4 text-center">No comments logged on this ticket.</p>
                  )}
                </div>

                {/* Submit new comment */}
                <form onSubmit={addComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    required
                    placeholder="Write a comment..."
                    className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-650 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {/* 1. Log Grievance Modal */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={fileComplaint} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Log Operational Complaint</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Hygiene">Hygiene & Cleanliness</option>
                  <option value="Food Quality">Food Quality & Taste</option>
                  <option value="Service">Dining Table Service</option>
                  <option value="Staff">Staff Disputes</option>
                  <option value="Infrastructure">POS / Printer hardware</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="LOW">LOW</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="HIGH">HIGH</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Brief Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g. Pastry display glass cracked"
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Detailed Grievance Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={3}
                placeholder="Provide specific notes and timestamps if applicable..."
                className="w-full text-xs bg-slate-950 border border-slate-855 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowFileModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
              >
                Submit Grievance
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Resolve Ticket Modal */}
      {showResolveModal && selectedTicket && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <form onSubmit={resolveTicket} className="w-full max-w-md rounded-xl border border-slate-850 bg-slate-900 p-6 space-y-4 shadow-2xl">
            <h3 className="font-extrabold text-base text-white">Resolve Grievance</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide">Resolution Action Notes</label>
              <textarea
                value={resNotes}
                onChange={(e) => setResNotes(e.target.value)}
                required
                rows={4}
                placeholder="Detail the steps taken to address this complaint..."
                className="w-full text-xs bg-slate-950 border border-slate-850 rounded-lg p-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-2 bg-slate-950 hover:bg-slate-850 text-slate-355 hover:text-white rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow shadow-emerald-600/10"
              >
                Close Ticket
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
