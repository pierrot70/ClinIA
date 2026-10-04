import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UI_LABELS_FR } from '../i18n/uiLabels.fr';

const authFetch = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ authFetch, logout: vi.fn(), user: null }) }));
vi.mock('../hooks/useTranslation', () => ({ useTranslation: ({ text }: {text: string}) => ({ translated: text }) }));
import ChangePasswordRequiredPage from './ChangePasswordRequiredPage';

afterEach(cleanup);
beforeEach(() => { authFetch.mockReset(); authFetch.mockResolvedValue({ ok: true, json: async () => ({}) }); });

describe('required new password form', () => {
    it('blocks multibyte overflow before any API request', () => {
        const { container } = render(<ChangePasswordRequiredPage />);
        const password = '🔐'.repeat(19);
        fireEvent.change(container.querySelector('#forced-new-password')!, { target: { value: password } });
        fireEvent.change(container.querySelector('#forced-confirm-password')!, { target: { value: password } });
        fireEvent.submit(container.querySelector('form')!);
        expect(screen.getByText(UI_LABELS_FR.auth.passwordPolicy.tooLong)).toBeInTheDocument();
        expect(authFetch).not.toHaveBeenCalled();
    });
    it('sends an exactly 72-byte password unchanged', async () => {
        const { container } = render(<ChangePasswordRequiredPage />);
        const password = '🔐'.repeat(18);
        fireEvent.change(container.querySelector('#forced-new-password')!, { target: { value: password } });
        fireEvent.change(container.querySelector('#forced-confirm-password')!, { target: { value: password } });
        fireEvent.submit(container.querySelector('form')!);
        await waitFor(() => expect(authFetch).toHaveBeenCalledWith('/api/auth/complete-password-reset', expect.objectContaining({ body: JSON.stringify({ newPassword: password }) })));
    });
});
