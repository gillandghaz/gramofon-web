"use client";

export default function KontakTab() {
  return (
    <div>
      <h2 className="tab-title">Kontak</h2>
      <p className="hint-text" style={{ marginBottom: 18 }}>
        Informasi kontak pembuat aplikasi ini.
      </p>

      <div className="contact-item">
        <span className="contact-item__label">GitHub</span>
        <span className="contact-item__value">Kontak menyusul</span>
      </div>
      <div className="contact-item">
        <span className="contact-item__label">Email</span>
        <span className="contact-item__value">Kontak menyusul</span>
      </div>
      <div className="contact-item">
        <span className="contact-item__label">Telepon</span>
        <span className="contact-item__value">Kontak menyusul</span>
      </div>
    </div>
  );
}
