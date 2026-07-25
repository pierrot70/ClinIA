import { describe, it, expect, afterEach, vi } from 'vitest';
/// <reference types="vitest" />
import { renderHook, act } from '@testing-library/react';
import { useClinicalAnalysis } from './useClinicalAnalysis';

const { mockAuthFetch } = vi.hoisted(() => ({
  mockAuthFetch: vi.fn(),
}));

vi.mock('../services/authService', () => ({
  authFetch: mockAuthFetch,
}));

describe('useClinicalAnalysis', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch and set result on success', async () => {
    const mockResult = { data: {
      hypothesis: 'Hypertension',
      treatments: [
        {
          name: 'Traitement B',
          justification: 'Justification B',
          contraindications: ['CI2'],
          efficacy: 90
        }
      ]
    } };
    mockAuthFetch.mockResolvedValueOnce({
      json: async () => mockResult,
    });
    const { result } = renderHook(() => useClinicalAnalysis());
    await act(async () => {
      await result.current.analyze({ age: 55, sex: 'male', symptoms: ['Hypertension'], medical_history: [], current_medications: [] });
    });
    expect(result.current.result).toEqual(mockResult.data);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('should set error on API error', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      json: async () => ({ error: { message: 'Erreur API' } }),
    });
    const { result } = renderHook(() => useClinicalAnalysis());
    await act(async () => {
      await result.current.analyze({ age: 55, sex: 'male', symptoms: ['Hypertension'], medical_history: [], current_medications: [] });
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Erreur API');
    expect(result.current.loading).toBe(false);
  });

  it('keeps only rejected field names for the cloud content guard', async () => {
    mockAuthFetch.mockResolvedValueOnce({
      json: async () => ({
        error: {
          code: 'UNAPPROVED_CLOUD_CLINICAL_CONTENT',
          message: "Le texte libre n'a pas ete transmis.",
          fields: ['diagnosis', 'symptoms'],
        },
      }),
    });
    const { result } = renderHook(() => useClinicalAnalysis());

    await act(async () => {
      await result.current.analyze({
        age: 55,
        sex: 'male',
        diagnosis: 'contenu libre confidentiel',
        symptoms: ['autre contenu confidentiel'],
        medical_history: [],
        current_medications: [],
      });
    });

    expect(result.current.errorCode).toBe('UNAPPROVED_CLOUD_CLINICAL_CONTENT');
    expect(result.current.errorFields).toEqual(['diagnosis', 'symptoms']);
    expect(JSON.stringify(result.current.errorFields)).not.toContain('confidentiel');
  });

  it('returns a blocking security incident to the calling page without storing clinical content', async () => {
    const blocking = {
      required: true,
      incident: {
        id: 'incident-123',
        type: 'NON_SECURE_CONTENT',
        reason: 'Potential identifier detected.',
        phase: 'pre_cloud',
        timestamp: '2026-07-25T10:00:00.000Z',
        context: {},
        matches: [],
      },
      acknowledgment: {
        requiredAction: "J'ai lu et compris",
        method: 'POST' as const,
        endpoint: '/api/security/incidents/acknowledge',
      },
      userMessage: 'Analyse bloquee.',
    };
    mockAuthFetch.mockResolvedValueOnce({
      json: async () => ({
        error: { code: 'SECURITY_INCIDENT_BLOCKING', message: 'Analyse bloquee.' },
        blocking,
      }),
    });
    const { result } = renderHook(() => useClinicalAnalysis());

    let returnedBlocking = null;
    await act(async () => {
      returnedBlocking = await result.current.analyze({
        age: 55,
        sex: 'male',
        diagnosis: 'test clinique',
        symptoms: [],
        medical_history: [],
        current_medications: [],
      });
    });

    expect(returnedBlocking).toEqual(blocking);
    expect(JSON.stringify(result.current.errorFields)).not.toContain('test clinique');
  });

  it('should set error on network error', async () => {
    mockAuthFetch.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useClinicalAnalysis());
    await act(async () => {
      await result.current.analyze({ age: 55, sex: 'male', symptoms: ['Hypertension'], medical_history: [], current_medications: [] });
    });
    expect(result.current.result).toBeNull();
    expect(result.current.error).toBe('Erreur réseau ou serveur.');
    expect(result.current.loading).toBe(false);
  });
});
