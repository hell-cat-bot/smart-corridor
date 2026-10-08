import React from "react";
import { Link } from "react-router-dom";

/** Shared frame for the sign-in and sign-up screens. */
export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-[#F7F7FB] flex flex-col items-center justify-center px-6 py-12 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#111827]/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="z-10 w-full max-w-sm">
        <Link
          to="/"
          className="flex items-center justify-center gap-2.5 mb-6 group"
        >
          <img
            src="images/logo.png"
            alt="Packmen Logo"
            className="w-8 h-8 group-hover:scale-110 transition-transform duration-300"
          />
          <div>
            <p className="text-base font-bold text-gray-900 tracking-tight leading-tight">
              Packmen
            </p>
            <p className="text-[9.5px] text-gray-400 font-semibold uppercase tracking-wider">
              Smart Corridor
            </p>
          </div>
        </Link>

        <div className="bg-white border border-[#E5E7EB] rounded-2xl shadow-xl shadow-[#111827]/5 p-6">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-[11.5px] text-gray-500 mt-1 leading-relaxed">
              {subtitle}
            </p>
          )}
          <div className="mt-5">{children}</div>
        </div>

        {footer && (
          <div className="mt-4 text-center text-[11.5px] text-gray-500">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
