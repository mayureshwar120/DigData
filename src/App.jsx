import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';

import { Sparkles } from 'lucide-react';

function App() {
  const [dataset, setDataset] = useState(null);

  const handleDataParsed = (parsedData) => {
    setDataset(parsedData);
  };

  const handleReset = () => {
    setDataset(null);
  };

  return (
    <div className="app-container">
      <header className="animate-fade-in">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <Sparkles color="var(--primary)" size={32} />
          <h1 className="gradient-text">AI Data Analyzer</h1>
        </div>
        <p>Turn complex data into simple, actionable insights in seconds.</p>
      </header>

      <main>
        {!dataset ? (
          <div style={{ maxWidth: '600px', margin: '0 auto', marginTop: '4rem' }}>
            <FileUpload onDataParsed={handleDataParsed} />
          </div>
        ) : (
          <Dashboard dataset={dataset} onReset={handleReset} />
        )}
      </main>
      
      <footer style={{ marginTop: '5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        <p>Made with Groq-powered dataset insights and Q&amp;A.</p>
      </footer>
    </div>
  );
}

export default App;
