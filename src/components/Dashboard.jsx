import React from 'react';
import ChartsView from './ChartsView';
import AIInsights from './AIInsights';
import QASection from './QASection';
import { ArrowLeft } from 'lucide-react';

const Dashboard = ({ dataset, onReset }) => {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '2rem', marginBottom: '4px' }}>Analysis Dashboard</h2>
          <p style={{ color: 'var(--text-muted)' }}>Currently analyzing: <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>{dataset.fileName}</span></p>
        </div>
        <button className="button button-outline" onClick={onReset}>
          <ArrowLeft size={18} /> New Analysis
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div style={{ gridColumn: '1 / -1' }}>
           <ChartsView data={dataset.data} fields={dataset.fields} />
        </div>
        
        <div style={{ gridColumn: '1 / 2' }}>
           <AIInsights data={dataset.data} fields={dataset.fields} fileName={dataset.fileName} />
        </div>
        
        <div style={{ gridColumn: '2 / 3' }}>
           <QASection data={dataset.data} fields={dataset.fields} fileName={dataset.fileName} />
        </div>
      </div>
      
    </div>
  );
};

export default Dashboard;
