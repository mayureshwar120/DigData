import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

const FileUpload = ({ onDataParsed }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const cleanCellValue = (value) => {
    if (value === undefined || value === null) {
      return '';
    }

    if (typeof value === 'string') {
      return value.trim();
    }

    return value;
  };

  const toUniqueFieldNames = (headers) => {
    const counts = new Map();

    return headers.map((header, index) => {
      const base = String(cleanCellValue(header) || `Column ${index + 1}`);
      const seen = counts.get(base) ?? 0;
      counts.set(base, seen + 1);

      return seen === 0 ? base : `${base} ${seen + 1}`;
    });
  };

  const normalizeRows = (rawRows) => {
    const populatedRows = rawRows
      .map((row) => row.map(cleanCellValue))
      .filter((row) => row.some((value) => value !== ''));

    if (populatedRows.length < 2) {
      throw new Error('The file needs at least one header row and one data row.');
    }

    const fields = toUniqueFieldNames(populatedRows[0]);
    const data = populatedRows
      .slice(1)
      .map((row) =>
        fields.reduce((record, field, index) => {
          const rawValue = row[index] ?? '';
          const parsedNumber =
            typeof rawValue === 'string' && rawValue !== '' ? Number(rawValue) : Number.NaN;

          record[field] =
            typeof rawValue === 'number'
              ? rawValue
              : Number.isFinite(parsedNumber) && rawValue !== ''
                ? parsedNumber
                : rawValue;

          return record;
        }, {}),
      );

    if (data.length === 0) {
      throw new Error('No usable data rows were found in the uploaded file.');
    }

    return { fields, data };
  };

  const parseDelimitedFile = (uploadedFile) =>
    new Promise((resolve, reject) => {
      Papa.parse(uploadedFile, {
        skipEmptyLines: 'greedy',
        dynamicTyping: true,
        delimiter: '',
        complete: (results) => {
          if (results.errors.length > 0) {
            reject(new Error(results.errors[0].message));
            return;
          }

          try {
            resolve(normalizeRows(results.data));
          } catch (normalizationError) {
            reject(normalizationError);
          }
        },
        error: (parseError) => reject(parseError),
      });
    });

  const parseSpreadsheetFile = async (uploadedFile) => {
    const buffer = await uploadedFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];

    if (!firstSheetName) {
      throw new Error('The spreadsheet does not contain any sheets.');
    }

    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      blankrows: false,
      defval: '',
    });

    return normalizeRows(rows);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = async (uploadedFile) => {
    setFile(uploadedFile);
    setIsProcessing(true);
    setError('');

    try {
      const extension = uploadedFile.name.split('.').pop()?.toLowerCase();
      let parsedDataset;

      if (extension === 'xlsx') {
        parsedDataset = await parseSpreadsheetFile(uploadedFile);
      } else if (extension === 'csv' || extension === 'txt') {
        parsedDataset = await parseDelimitedFile(uploadedFile);
      } else {
        throw new Error('Unsupported file type. Please upload a CSV, TXT, or XLSX file.');
      }

      onDataParsed({
        fileName: uploadedFile.name,
        ...parsedDataset,
      });
    } catch (parseError) {
      setFile(null);
      setError(parseError.message || 'We could not read that file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', transition: 'all 0.3s ease', border: isDragging ? '2px dashed var(--primary)' : '1px solid var(--glass-border)' }}>
      <form 
        onDragEnter={handleDrag} 
        onDragLeave={handleDrag} 
        onDragOver={handleDrag} 
        onDrop={handleDrop}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}
      >
        <input 
          ref={fileInputRef} 
          type="file" 
          accept=".csv,.txt,.xlsx" 
          onChange={handleChange} 
          style={{ display: 'none' }} 
        />
        
        {file ? (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            {isProcessing ? <Loader2 size={64} color="var(--primary)" className="spin" /> : <CheckCircle2 size={64} color="var(--success)" />}
            <h3 style={{ fontSize: '1.5rem' }}>{isProcessing ? 'Reading File' : 'File Uploaded'}</h3>
            <p style={{ color: 'var(--text-muted)' }}>{file.name}</p>
            <p style={{ color: 'var(--primary)' }}>
              {isProcessing ? 'Parsing your dataset...' : 'Dataset parsed successfully.'}
            </p>
          </div>
        ) : (
          <>
            <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '24px', borderRadius: '50%' }}>
              <Upload size={48} color="var(--primary)" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Upload your Dataset</h3>
              <p style={{ color: 'var(--text-muted)' }}>Drag and drop your CSV, text, or Excel file here, or click to browse.</p>
            </div>
            <button type="button" className="button" onClick={onButtonClick}>
              Select File
            </button>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={16}/> CSV</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={16}/> XLSX</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileText size={16}/> TXT</span>
            </div>
          </>
        )}

        {error && (
          <div
            className="animate-fade-in"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              width: '100%',
              textAlign: 'left',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              color: '#fecaca',
              borderRadius: '12px',
              padding: '12px 14px',
            }}
          >
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{error}</span>
          </div>
        )}
      </form>

      <style dangerouslySetInnerHTML={{ __html: `
        .spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      ` }} />
    </div>
  );
};

export default FileUpload;
