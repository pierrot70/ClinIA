import { describe, it, expect, vi } from 'vitest';
/// <reference types="vitest" />
import { renderHook, act } from '@testing-library/react';
import { useClinicalAnalysis } from '../hooks/useClinicalAnalysis';

const { mockAuthFetch } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
}));

vi.mock('../services/authService', () => ({
  authFetch: mockAuthFetch,
}));

describe('Results IA integration', () => {
  it('should call analyze and set result', async () => {
    mockAuthFetch.mockResolvedValue({
      json: async () => ({ data: {
        hypothesis: 'Test',
        treatments: [
          {
            name: 'Traitement A',
            justification: 'Justification A',
            contraindications: ['CI1'],
            efficacy: 80
          }
        ]
      } })
    });
    const { result } = renderHook(() => useClinicalAnalysis());
    await act(async () => {
      await result.current.analyze({ age: 55, sex: 'male', symptoms: ['Test'], medical_history: [], current_medications: [] });
    });
    expect(result.current.result).toEqual({
      hypothesis: 'Test',
      treatments: [
        {
          name: 'Traitement A',
          justification: 'Justification A',
          contraindications: ['CI1'],
          efficacy: 80
        }
      ]
    });
    expect(result.current.error).toBeNull();
  });
});
