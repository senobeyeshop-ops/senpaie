import type { ReactNode } from 'react';

export function AuthCadre({ titre, sousTitre, children }: { titre: string; sousTitre?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-marque-900 p-12 text-white lg:flex">
        <div className="relative h-48 w-80 overflow-hidden rounded-xl bg-white">
            <img src="/LOGO%20SENPAIE.jpg" alt="SenPaie — La paie sénégalaise" style={{ width: 560 }}
              className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" />
          </div>
        <div>
          <h2 className="text-3xl font-bold leading-tight">La paie de votre PME,<br />conforme et sans stress.</h2>
          <ul className="mt-6 space-y-2 text-green-100">
            <li>✓ Bulletins de paie conformes (IR, TRIMF, IPRES, CSS)</li>
            <li>✓ VRS et BRS prêts pour eTax</li>
            <li>✓ Déclarations IPRES & CSS en un clic</li>
          </ul>
        </div>
        <p className="text-sm text-green-200">Conçu à Dakar pour les PME sénégalaises.</p>
      </div>
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <div className="relative h-32 w-56 overflow-hidden rounded-xl bg-white">
            <img src="/LOGO%20SENPAIE.jpg" alt="SenPaie — La paie sénégalaise" style={{ width: 380 }}
              className="absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2" />
          </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{titre}</h1>
          {sousTitre && <p className="mt-1 text-sm text-slate-500">{sousTitre}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
