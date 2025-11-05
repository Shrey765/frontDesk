import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Room } from "livekit-client";
import "./App.css";

const API_BASE = "http://localhost:4000/api/v1";
const LIVEKIT_URL = "wss://frontdesk-flwj05rb.livekit.cloud"; // 🔧 replace with your LiveKit WS URL
const SUPERVISOR_TOKEN = "http://localhost:4000/api/v1/livekit/getToken"; // 🔧 replace with your valid token

function App() {
  const [requests, setRequests] = useState([]);
  const [replies, setReplies] = useState({});
  const [loading, setLoading] = useState(false);
  const [sendingFor, setSendingFor] = useState(null);
  const [error, setError] = useState("");
  const [room, setRoom] = useState(null);

  // 1️⃣ Connect to LiveKit room once when the UI loads
  useEffect(() => {
    const connectLiveKit = async () => {
      try {
        const r = new Room();
        await r.connect(LIVEKIT_URL, SUPERVISOR_TOKEN);
        console.log("✅ Connected to LiveKit as supervisor");
        setRoom(r);
      } catch (err) {
        console.error("❌ Failed to connect to LiveKit:", err);
      }
    };
    connectLiveKit();
  }, []);

  // 2️⃣ Fetch all pending customer requests
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(`${API_BASE}/customer-requests/all`);
        setRequests(res.data.requests || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load requests");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 3️⃣ Sort requests by newest first
  const sorted = useMemo(
    () =>
      [...requests].sort((a, b) => {
        const aTs = a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : a.createdAt?._seconds
          ? a.createdAt._seconds * 1000
          : a.createdAt || 0;
        const bTs = b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : b.createdAt?._seconds
          ? b.createdAt._seconds * 1000
          : b.createdAt || 0;
        return bTs - aTs;
      }),
    [requests]
  );

  const formatDate = (ts) => {
    if (!ts) return "";
    if (ts?.toMillis) return new Date(ts.toMillis()).toLocaleString();
    if (ts?._seconds) return new Date(ts._seconds * 1000).toLocaleString();
    return new Date(ts).toLocaleString();
  };

  const statusClass = (s) =>
    s === "resolved"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-amber-100 text-amber-700 ring-amber-200";

  // 4️⃣ When supervisor clicks Send
  const onSend = async (item) => {
    const text = (replies[item.id] || "").trim();
    if (!text) return;

    setSendingFor(item.id);
    setError("");

    try {
      // update in backend
      const res = await axios.post(
        `${API_BASE}/customer-requests/${item.id}/resolve`,
        { answer: text }
      );

      if (res.status !== 200) throw new Error(res.data?.message || "Failed to resolve");

      // remove from pending list
      setRequests((prev) => prev.filter((r) => r.id !== item.id));
      setReplies((r) => ({ ...r, [item.id]: "" }));

      // ✅ Speak locally (browser)
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "en-US";
      utter.rate = 1;
      utter.pitch = 1;
      speechSynthesis.speak(utter);

      // ✅ Send message to LiveKit room (so agent also speaks)
      if (room) {
        const payload = JSON.stringify({
          type: "supervisor_reply",
          text,
          customerId: item.customerId,
          requestId: item.id,
        });
        await room.localParticipant.publishData(
          new TextEncoder().encode(payload),
          { reliable: true }
        );
        console.log("📤 Sent reply to LiveKit:", payload);
      } else {
        console.warn("⚠️ No LiveKit room connected yet.");
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setSendingFor(null);
    }
  };

  return (
    <div className="fixed inset-0 w-full max-h-screen grid grid-rows-[auto,1fr]">
      <div className="w-full bg-orange-300">
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
            <h1 className="text-lg font-semibold">Pending Requests</h1>
            <span className="text-sm text-slate-500">
              {loading ? "Loading..." : `${sorted.length} items`}
            </span>
            {error ? (
              <span className="text-sm text-red-500">{error}</span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="bg-orange-500 p-8 flex justify-center items-start overflow-auto min-h-0">
        <div className="w-full bg-white rounded border border-slate-200">
          <div className="mx-auto max-w-7xl p-4">
            <div className="bg-gray-500 overflow-hidden border-2 rounded-lg border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-3 py-3 w-16">S.No</th>
                      <th className="px-3 py-3">Customer ID</th>
                      <th className="px-3 py-3">Request</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 whitespace-nowrap">Created At</th>
                      <th className="px-3 py-3 min-w-[300px]">Reply</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {!loading &&
                      sorted.map((item, i) => {
                        const reply = replies[item.id] || "";
                        return (
                          <tr
                            key={item.id}
                            className="bg-orange-300 hover:bg-slate-50/60"
                          >
                            <td className="p-2 text-slate-600">{i + 1}</td>
                            <td className="p-2 font-medium">
                              {item.customerId || "anonymous"}
                            </td>
                            <td className="p-2 text-slate-700">
                              <p className="leading-5">
                                {item.question || item.request || "—"}
                              </p>
                            </td>
                            <td className="px-2 py-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(
                                  item.status || "pending"
                                )}`}
                              >
                                {(item.status || "pending")
                                  .charAt(0)
                                  .toUpperCase() +
                                  (item.status || "pending").slice(1)}
                              </span>
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                              {formatDate(item.createdAt)}
                            </td>
                            <td className="px-3 py-3">
                              <label
                                className="sr-only"
                                htmlFor={`reply-${item.id}-${i}`}
                              >
                                Reply to {item.customerId}
                              </label>
                              <textarea
                                id={`reply-${item.id}-${i}`}
                                rows={2}
                                value={reply}
                                onChange={(e) =>
                                  setReplies((r) => ({
                                    ...r,
                                    [item.id]: e.target.value,
                                  }))
                                }
                                placeholder="Type your response…"
                                className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <div className="mt-2 flex items-center gap-2">
                                <button
                                  onClick={() => onSend(item)}
                                  disabled={!reply.trim() || sendingFor === item.id}
                                  className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition"
                                >
                                  {sendingFor === item.id
                                    ? "Sending..."
                                    : "Send"}
                                </button>
                                <button
                                  onClick={() =>
                                    setReplies((r) => ({ ...r, [item.id]: "" }))
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
                                >
                                  Clear
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {!loading && sorted.length === 0 && (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-slate-500"
                          colSpan="6"
                        >
                          No pending requests.
                        </td>
                      </tr>
                    )}
                    {loading && (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-slate-500"
                          colSpan="6"
                        >
                          Loading...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
