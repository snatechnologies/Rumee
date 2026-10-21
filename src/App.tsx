import { Outlet } from 'react-router-dom';

export default function App() {
  return (
    <div className="felt mx-auto flex h-full w-full max-w-md flex-col overflow-hidden">
      <Outlet />
    </div>
  );
}
