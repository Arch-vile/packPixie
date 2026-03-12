import ApiConnectionStatus from './ApiConnectionStatus';

export function Header() {
  return (
    <div className="w-full bg-black">
      <span>UI version: {import.meta.env.VITE_APP_VERSION}</span>,&nbsp;
      <ApiConnectionStatus />
    </div>
  );
}
