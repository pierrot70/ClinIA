// src/types/api.ts

export type ApiErrorSource = "openai" | "mongo" | "internal";

export interface ApiError {
    source: ApiErrorSource;
    message: string;
    technical?: string;
}

export interface ApiSuccess<T> {
    data: T;
}

export interface ApiFailure {
    error: ApiError;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
