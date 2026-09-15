"use client";

import { useState } from "react";

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete = "current-password",
  required = false,
  placeholder,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-field">
      <input
        id={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="password-field__toggle"
        onClick={() => setVisible((v) => !v)}
        // aria-label berubah sesuai state, penting untuk pengguna screen reader
        aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
      <path
        d="M2.5 2.5l15 15M8.3 8.4a2.6 2.6 0 0 0 3.3 3.3M6.2 5.5C3.4 6.9 1.5 10 1.5 10s3 6 8.5 6c1.5 0 2.8-.4 3.9-1M15.4 14.1c1.8-1.4 3.1-4.1 3.1-4.1s-1.4-2.9-4-4.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
