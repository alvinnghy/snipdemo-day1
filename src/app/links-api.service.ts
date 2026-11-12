import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface LinkRecord {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

const apiBaseUrl =
  typeof window !== 'undefined' && window.location.port === '4200'
    ? 'http://localhost:3000'
    : '';

@Injectable({ providedIn: 'root' })
export class LinksApiService {
  private readonly http = inject(HttpClient);

  getLinks(): Observable<LinkRecord[]> {
    return this.http.get<LinkRecord[]>(`${apiBaseUrl}/api/links`);
  }

  createLink(url: string): Observable<LinkRecord> {
    return this.http.post<LinkRecord>(`${apiBaseUrl}/api/links`, { url });
  }
}
