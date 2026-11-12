import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { LinkRecord } from './links-api.service';

describe('AppComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    httpTesting.expectOne('/api/links').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('rejects non-HTTP URLs without submitting them', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;

    component.form.controls.url.setValue('ftp://example.com/file');
    component.submit();

    expect(component.form.controls.url.hasError('httpUrl')).toBeTrue();
    expect(component.isSubmitting()).toBeFalse();
    httpTesting.expectNone((request) => request.method === 'POST');
  });

  it('submits a valid URL and refreshes the links list', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const link: LinkRecord = {
      code: 'a1B2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    };

    component.form.controls.url.setValue(link.url);
    component.submit();

    const post = httpTesting.expectOne('/api/links');
    expect(post.request.body).toEqual({ url: link.url });
    post.flush(link, { status: 201, statusText: 'Created' });
    httpTesting.expectOne('/api/links').flush([link]);
    fixture.detectChanges();

    expect(component.createdLink()).toEqual(link);
    expect(component.links()).toEqual([link]);
    expect(fixture.nativeElement.textContent).toContain(link.shortUrl);
  });

  it('shows the API error beside the form after a failed submission', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.form.controls.url.setValue('https://example.com');

    component.submit();
    httpTesting.expectOne('/api/links').flush(
      { error: 'The service rejected this URL.' },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(component.formError()).toBe('The service rejected this URL.');
    expect(fixture.nativeElement.textContent).toContain('The service rejected this URL.');
    expect(component.isSubmitting()).toBeFalse();
  });
});
