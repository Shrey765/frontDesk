import React, { useMemo, useState } from "react";
import "./App.css";

function App() {
  const [data] = useState([
    { id: "rq_101", customerId: "CUS-49821", request: "Need invoice copy for order #A123.", status: "pending",  createdAt: Date.now() - 1000 * 60 * 35 },
    { id: "rq_102", customerId: "CUS-78305", request: "Refund not received yet.",        status: "pending",  createdAt: Date.now() - 1000 * 60 * 60 * 5 },
    { id: "rq_103", customerId: "CUS-91022", request: "Please change the delivery address to 221B Baker Street.", status: "resolved", createdAt: Date.now() - 1000 * 60 * 60 * 26 },
    { id: "rq_104", customerId: "CUS-12888", request: "Can I upgrade my plan mid-cycle?", status: "pending",  createdAt: Date.now() - 1000 * 60 * 60 * 50 },
  ]);

  const [replies, setReplies] = useState({});

  const sorted = useMemo(() => [...data].sort((a, b) => b.createdAt - a.createdAt), [data]);

  const onSend = (item) => {
    const text = (replies[item.id] || "").trim();
    if (!text) return;
    alert(`Reply sent for ${item.customerId}:\n\n${text}`);
    setReplies((r) => ({ ...r, [item.id]: "" }));
  };

  const statusClass = (s) =>
    s === "resolved"
      ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
      : "bg-amber-100 text-amber-700 ring-amber-200";

  return (
    <div className="fixed inset-0 w-full max-h-screen grid grid-rows-[auto,1fr]">
      <div className="w-full bg-orange-300">
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-3 flex items-center gap-3">
            <h1 className="text-lg font-semibold">Pending Requests</h1>
            <span className="text-sm text-slate-500">{sorted.length} items</span>
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
                    {sorted.map((item, i) => {
                      const created = new Date(item.createdAt).toLocaleString();
                      const reply = replies[item.id] || "";
                      return (
                        // Use a UNIQUE key even if ids repeat
                        <tr key={`${item.id}-${i}`} className="bg-orange-300 hover:bg-slate-50/60">
                          <td className="p-2 text-slate-600">{i + 1}</td>
                          <td className="p-2 font-medium">{item.customerId}</td>
                          <td className="p-2 text-slate-700">
                            <p className="leading-5">{item.request}</p>
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusClass(
                                item.status
                              )}`}
                            >
                              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                            {created}
                          </td>
                          <td className="px-3 py-3">
                            <label className="sr-only" htmlFor={`reply-${item.id}-${i}`}>
                              Reply to {item.customerId}
                            </label>
                            <textarea
                              id={`reply-${item.id}-${i}`}
                              rows={2}
                              value={reply}
                              onChange={(e) =>
                                setReplies((r) => ({ ...r, [item.id]: e.target.value }))
                              }
                              placeholder="Type your response…"
                              className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                onClick={() => onSend(item)}
                                disabled={!reply.trim()}
                                className="rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-indigo-700 transition"
                              >
                                Send
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
                    {sorted.length === 0 && (
                      <tr>
                        <td className="px-3 py-6 text-center text-slate-500" colSpan="6">
                          No requests found.
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
  )
}

export default App;
