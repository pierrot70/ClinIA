import { describe, it, expect, beforeAll, vi } from 'vitest';
/// <reference types="vitest" />
vi.mock('../services/securityIncidentApi', () => ({
  acknowledgeSecurityIncident: vi.fn(),
  REQUIRED_ACK_ACTION: 'ACK',
}));
vi.mock('../services/config', () => ({
  API_URL: 'http://localhost:4000',
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'SUPERADMIN' } }),
}));
// beforeAll(() => {
//   process.env.VITE_API_URL = 'http://localhost:4000';
// });
import { render, screen, fireEvent } from '@testing-library/react';
import { ClinicalAnalyzePage } from './ClinicalAnalyzePage';

vi.mock('../hooks/useClinicalAnalysis', () => {
  return {
    useClinicalAnalysis: () => ({
      result: { hypothesis: 'Test', options: ['A'] },
      loading: false,
      error: null,
      analyze: vi.fn(),
    }),
  };
});

describe('ClinicalAnalyzePage integration', () => {
  it('should render without crashing', () => {
    render(<ClinicalAnalyzePage />);
    expect(screen.getByText(/OpenAI Model|Modèle OpenAI/)).toBeTruthy();
  });
});
