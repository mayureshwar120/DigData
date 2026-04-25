import React, { useState } from 'react';
import { MessageSquare, Send, Bot, User } from 'lucide-react';
import { buildDatasetDigest } from '../lib/datasetDigest';
import { buildLocalQaAnswer, isMissingAiRouteError } from '../lib/localAiFallback';

const hasAiDevRoutes = import.meta.env.DEV;

const QASection = ({ data, fields, fileName }) => {
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'Hello! Ask me anything about this uploaded dataset and I will answer from the data context.' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState('');
  const [usingFallback, setUsingFallback] = useState(false);

  const toFriendlyError = (message) => {
    const raw = String(message || '');

    if (raw.includes('GROQ_API_KEY is not configured')) {
      return 'API key missing. Add GROQ_API_KEY to .env.local, then restart `npm run dev`.';
    }
    if (raw.includes('404')) {
      return 'AI API route not found. Start the app with `npm run dev` (not opening dist/index.html directly).';
    }
    if (raw.includes('401') || raw.toLowerCase().includes('incorrect api key')) {
      return 'Groq API key is invalid. Update GROQ_API_KEY in .env.local and restart the dev server.';
    }
    if (raw.includes('403')) {
      return 'The AI provider rejected this request with 403 Forbidden. Check the API key, provider permissions, and billing or credits.';
    }
    if (raw.includes('429') || raw.toLowerCase().includes('rate limit') || raw.toLowerCase().includes('quota')) {
      return 'AI provider rate limit reached. Check provider billing or usage and try again.';
    }
    if (raw.toLowerCase().includes('failed to fetch')) {
      return 'Could not reach AI backend. Ensure `npm run dev` is running and internet is available.';
    }

    return raw || 'Could not get an answer right now.';
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMsg = query;
    const nextHistory = [...chatHistory, { role: 'user', text: userMsg }];
    setChatHistory(nextHistory);
    setQuery('');
    setIsTyping(true);
    setError('');
    setUsingFallback(false);

    try {
      const digest = buildDatasetDigest(data, fields);

      if (!hasAiDevRoutes) {
        setUsingFallback(true);
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            text: buildLocalQaAnswer({ question: userMsg, dataset: digest, fileName }),
          },
        ]);
        return;
      }

      const response = await fetch('/api/ai/qa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName,
          question: userMsg,
          dataset: digest,
          history: nextHistory.slice(-8),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ? `${payload.error} (HTTP ${response.status})` : `AI request failed (HTTP ${response.status})`);
      }

      setUsingFallback(Boolean(payload.fallback));
      setChatHistory((prev) => [...prev, { role: 'ai', text: payload.text || 'No answer returned.' }]);
    } catch (requestError) {
      const digest = buildDatasetDigest(data, fields);

      if (isMissingAiRouteError(requestError.message)) {
        setUsingFallback(true);
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            text: buildLocalQaAnswer({ question: userMsg, dataset: digest, fileName }),
          },
        ]);
      } else {
        const friendly = toFriendlyError(requestError.message);
        setError(friendly);
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'ai',
            text: friendly,
          },
        ]);
      }
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.5rem' }}>
        <MessageSquare color="var(--primary)" />
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Ask your Data</h3>
      </div>

      <div style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem', maxHeight: '300px' }}>
        {chatHistory.map((msg, idx) => (
          <div key={idx} className="animate-fade-in" style={{ display: 'flex', gap: '12px', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            {msg.role === 'ai' && (
              <div style={{ background: 'var(--primary)', height: '32px', width: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bot size={18} color="white" />
              </div>
            )}
            <div style={{ 
              background: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)', 
              padding: '12px 16px', 
              borderRadius: '16px', 
              borderBottomRightRadius: msg.role === 'user' ? '4px' : '16px',
              borderBottomLeftRadius: msg.role === 'ai' ? '4px' : '16px',
              color: 'var(--text-main)',
              fontSize: '0.95rem',
              lineHeight: 1.5
            }}>
              {msg.text}
            </div>
            {msg.role === 'user' && (
              <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', height: '32px', width: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={18} color="white" />
              </div>
            )}
          </div>
        ))}
        {isTyping && (
          <div className="animate-fade-in" style={{ display: 'flex', gap: '12px', alignSelf: 'flex-start' }}>
            <div style={{ background: 'var(--primary)', height: '32px', width: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Bot size={18} color="white" />
            </div>
            <div style={{ background: 'var(--bg-secondary)', padding: '12px 16px', borderRadius: '16px', borderBottomLeftRadius: '4px', display: 'flex', gap: '4px', alignItems: 'center' }}>
               <span className="dot-typing"></span>
               <span className="dot-typing" style={{ animationDelay: '0.2s' }}></span>
               <span className="dot-typing" style={{ animationDelay: '0.4s' }}></span>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask a question..."
          style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--bg-secondary)', color: 'var(--text-main)' }}
        />
        <button type="submit" className="button" disabled={isTyping || !query.trim()} style={{ padding: '12px' }}>
          <Send size={18} />
        </button>
      </form>
      {usingFallback && !error && (
        <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.82rem' }}>
          Using browser-side answers because the AI backend is unavailable in this runtime.
        </p>
      )}
      {error && <p style={{ color: '#fca5a5', marginTop: '8px', fontSize: '0.82rem' }}>{error}</p>}

      <style dangerouslySetInnerHTML={{__html: `
        .dot-typing {
          width: 6px;
          height: 6px;
          background-color: var(--text-muted);
          border-radius: 50%;
          animation: type 1.4s infinite both;
        }
        @keyframes type {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `}} />
    </div>
  );
};

export default QASection;
