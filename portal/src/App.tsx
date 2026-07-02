import { Route, Routes } from 'react-router-dom';

/** Static hub: each app handles its own sign-in (TAT uses shared passcode on its site). */
const PortalHome = () => {
  const apps = [
    {
      name: 'Tax Aware Transition',
      href: 'https://tat.auourinvest.com',
      note: 'Open the app, then sign in there with your office passcode.',
    },
    {
      name: 'Regime',
      href: 'https://regime.auourinvest.com',
      note: 'Sign in follows your Regime site settings.',
      disabled: false,
    },
    {
      name: 'Auour Proposal',
      href: '',
      disabled: true,
      note: 'Coming soon.',
    },
    {
      name: 'More',
      href: '',
      disabled: true,
      note: 'Additional tools will appear here.',
    },
  ];

  return (
    <div className="card portal-card">
      <p className="eyebrow">Auour</p>
      <h1>Auour Portal</h1>
      <p className="lead">
        Choose an application below. Internal tools ask for a shared passcode on their own landing
        pages—nothing to set up here.
      </p>
      <div className="grid">
        {apps.map((app) => (
          <div key={app.name} className="app-tile-wrap">
            {app.disabled ? (
              <div className="app-card disabled" tabIndex={-1}>
                <span className="app-name">{app.name}</span>
                <span className="app-note">{app.note}</span>
              </div>
            ) : (
              <a className="app-card" href={app.href}>
                <span className="app-name">{app.name}</span>
                <span className="app-note">{app.note}</span>
                <span className="cta">Open →</span>
              </a>
            )}
          </div>
        ))}
      </div>
      <p className="footnote">
        If you followed an older email magic link, ignore it—you can always start from this portal.
      </p>
    </div>
  );
};

const App = () => (
  <div className="page">
    <Routes>
      <Route path="/" element={<PortalHome />} />
      {/* Old magic-link URLs: still land on usable page */}
      <Route path="/auth/verify" element={<PortalHome />} />
      <Route path="*" element={<PortalHome />} />
    </Routes>
  </div>
);

export default App;
