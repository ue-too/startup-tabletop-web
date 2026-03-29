import { BrowserRouter, Routes, Route } from 'react-router';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import SimPage from './pages/SimPage';
import ReplayPage from './pages/ReplayPage';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-950 text-white">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play" element={<GamePage />} />
          <Route path="/simulate" element={<SimPage />} />
          <Route path="/replay" element={<ReplayPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
