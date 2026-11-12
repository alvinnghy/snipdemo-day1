import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn } from '@angular/forms';
import { LinkRecord, LinksApiService } from './links-api.service';

const httpUrlValidator: ValidatorFn = (control): ValidationErrors | null => {
  const value = typeof control.value === 'string' ? control.value.trim() : '';
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? null
      : { httpUrl: true };
  } catch {
    return { httpUrl: true };
  }
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksApi = inject(LinksApiService);

  readonly links = signal<LinkRecord[]>([]);
  readonly isLoading = signal(true);
  readonly isSubmitting = signal(false);
  readonly createdLink = signal<LinkRecord | null>(null);
  readonly formError = signal('');
  readonly listError = signal('');

  readonly form = this.formBuilder.nonNullable.group({
    url: ['', [httpUrlValidator]],
  });

  ngOnInit(): void {
    this.refreshLinks();
  }

  submit(): void {
    const urlControl = this.form.controls.url;
    urlControl.markAsTouched();
    this.formError.set('');
    this.createdLink.set(null);

    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.linksApi.createLink(urlControl.value.trim()).subscribe({
      next: (link) => {
        this.createdLink.set(link);
        this.form.reset();
        this.refreshLinks();
      },
      error: (error: unknown) => {
        this.formError.set(this.getErrorMessage(error, 'Could not shorten that URL.'));
        this.isSubmitting.set(false);
      },
      complete: () => this.isSubmitting.set(false),
    });
  }

  private refreshLinks(): void {
    this.isLoading.set(true);
    this.listError.set('');
    this.linksApi.getLinks().subscribe({
      next: (links) => this.links.set(links),
      error: (error: unknown) => {
        this.listError.set(this.getErrorMessage(error, 'Could not load your links.'));
        this.isLoading.set(false);
      },
      complete: () => this.isLoading.set(false),
    });
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage = error.error?.error;
      if (typeof serverMessage === 'string') {
        return serverMessage;
      }
      if (error.status === 0) {
        return 'Could not reach the Snip API. Check that the backend is running.';
      }
    }
    return fallback;
  }
}
