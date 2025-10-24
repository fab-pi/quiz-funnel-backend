export interface SessionStartRequest {
    quiz_id: string;
    utm_source?: string;
    utm_campaign?: string;
    utm_medium?: string;
    utm_term?: string;
    utm_content?: string;
}
export interface SessionStartResponse {
    session_id: string;
    success: boolean;
    message: string;
}
export interface UserSession {
    session_id: string;
    quiz_id: string;
    last_question_viewed: number;
    is_completed: boolean;
    utm_source?: string;
    utm_campaign?: string;
    utm_medium?: string;
    utm_term?: string;
    utm_content?: string;
    final_profile?: string;
    created_at: Date;
    updated_at: Date;
}
//# sourceMappingURL=index.d.ts.map