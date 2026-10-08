import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrafficCone, Ambulance, Activity } from "lucide-react";
import useAuthStore from "../store/useAuthStore";

const highlights = [
  {
    icon: Ambulance,
    title: "Mission-based dispatch",
    body: "Calls at a scene, nearest unit from a hospital or fire station, multi-leg response with on-scene dwell.",
  },
  {
    icon: Activity,
    title: "Live congestion routing",
    body: "A* prices every segment against a live congestion index, replanning around blockages and jams.",
  },
  {
    icon: TrafficCone,
    title: "Green corridor",
    body: "Signal preemption along a frozen path, with junction contests resolved by priority class.",
  },
];

export default function Landing() {
  const authed = useAuthStore((s) => s.status === "authed");

  return (
    <div className="min-h-screen bg-[#F7F7FB] flex flex-col items-center justify-center relative overflow-hidden px-6 py-12">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#111827]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="z-10 flex flex-col items-center text-center max-w-4xl">
        <img src="images/logo.png" className="w-16 h-16" alt="Packmen Logo" />
        <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-3 tracking-tight">
          Smart-Corridor
        </h1>

        <p className="text-base md:text-lg text-gray-500 mb-2 max-w-xl">
          Smart-Corridor operations console — 5G-URLLC emergency routing,
          dynamic response to blockages and green-wave signal preemption on a
          live digital twin.
        </p>

        {/* The console is behind a sign-in, so the door goes to the right place
            depending on whether this browser already has a session. */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <Link
            to={authed ? "/dashboard" : "/login"}
            className="flex items-center gap-2 bg-[#111827] hover:bg-[#1F2937] text-white rounded-full px-8 py-3 text-base font-semibold shadow-lg shadow-black/10 transition-all hover:scale-105 active:scale-95"
          >
            {authed ? "Open operations console" : "Sign in to the console"}
            <ArrowRight className="w-5 h-5" />
          </Link>

          {!authed && (
            <Link
              to="/register"
              className="flex items-center gap-2 bg-white border border-[#E5E7EB] text-gray-700 hover:bg-gray-50 rounded-full px-6 py-3 text-sm font-semibold transition-colors"
            >
              Create an account
            </Link>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-14 text-left w-full">
          {highlights.map((h) => (
            <div
              key={h.title}
              className="bg-white/80 backdrop-blur border border-[#E5E7EB] rounded-xl p-4"
            >
              <h.icon className="w-4 h-4 text-[#111827] mb-2" />
              <p className="text-[12px] font-bold text-gray-900">{h.title}</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                {h.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
