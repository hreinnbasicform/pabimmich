<script lang="ts">
  import { goto } from '$app/navigation';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { Route } from '$lib/route';
  import { oauth } from '$lib/utils';
  import { getServerErrorMessage, handleError } from '$lib/utils/handle-error';
  import { login, type LoginResponseDto } from '@immich/sdk';
  import { Alert, Button, Field, Input, PasswordInput, Stack, Text } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let errorMessage: string = $state('');
  let email = $state('');
  let password = $state('');
  let oauthError = $state('');
  let loading = $state(false);
  let oauthLoading = $state(true);

  const serverConfig = $derived(serverConfigManager.value);
  const siteName = $derived(data.siteName || '');

  const onSuccess = async (user: LoginResponseDto) => {
    await goto(data.continueUrl, { invalidateAll: true });
    eventManager.emit('AuthLogin', user);
  };

  const onFirstLogin = () => goto(Route.changePassword());
  const onOnboarding = () => goto(Route.onboarding());

  onMount(async () => {
    // Mark form fields for password managers after mount (Svelte re-renders covered by attrs)
    if (typeof document !== 'undefined') {
      document.title = siteName
        ? `Sign in to ${siteName} — PhotoAppBackend`
        : 'Login - PhotoAppBackend';
    }

    if (!featureFlagsManager.value.oauth) {
      oauthLoading = false;
      return;
    }

    if (oauth.isCallback(location)) {
      try {
        const user = await oauth.login(location);

        if (!user.isOnboarded) {
          await onOnboarding();
          return;
        }

        await onSuccess(user);
        return;
      } catch (error) {
        console.error('Error [login-form] [oauth.callback]', error);
        oauthError = getServerErrorMessage(error) || $t('errors.unable_to_complete_oauth_login');
        oauthLoading = false;
        return;
      }
    }

    try {
      if (
        (featureFlagsManager.value.oauthAutoLaunch && !oauth.isAutoLaunchDisabled(location)) ||
        oauth.isAutoLaunchEnabled(location)
      ) {
        await goto(Route.login({ autoLaunch: 0 }), { replaceState: true });
        await oauth.authorize(location);
        return;
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_connect'));
    }

    oauthLoading = false;
  });

  const handleLogin = async () => {
    try {
      errorMessage = '';
      loading = true;
      const user = await login({ loginCredentialDto: { email, password } });

      if (user.isAdmin && !serverConfig.isOnboarded) {
        await onOnboarding();
        return;
      }

      // change the user password before we onboard them
      if (!user.isAdmin && user.shouldChangePassword) {
        await onFirstLogin();
        return;
      }

      // We want to onboard after the first login since their password will change
      // and handleLogin will be called again (relogin). We then do onboarding on that next call.
      if (!user.isOnboarded) {
        await onOnboarding();
        return;
      }

      await onSuccess(user);
      return;
    } catch (error) {
      errorMessage = getServerErrorMessage(error) || $t('errors.incorrect_email_or_password');
      loading = false;
      return;
    }
  };

  const handleOAuthLogin = async () => {
    oauthLoading = true;
    oauthError = '';
    const success = await oauth.authorize(location);
    if (!success) {
      oauthLoading = false;
      oauthError = $t('errors.unable_to_login_with_oauth');
    }
  };

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await handleLogin();
  };
</script>

<AuthPageLayout title={data.meta.title}>
  <Stack gap={4}>
    {#if siteName}
      <div
        class="mb-2 rounded-xl border border-immich-primary/30 bg-immich-primary/10 px-4 py-3 text-center dark:border-immich-dark-primary/40 dark:bg-immich-dark-primary/10"
        data-pab-site-banner
        role="status"
        aria-label="Signing in to site {siteName}"
      >
        <Text size="small" class="uppercase tracking-wide opacity-70">Signing in to</Text>
        <div class="mt-0.5 text-xl font-bold tracking-tight text-immich-primary dark:text-immich-dark-primary">
          {siteName}
        </div>
      </div>
    {/if}

    {#if serverConfig.loginPageMessage}
      <Alert color="primary" class="mb-6">
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html serverConfig.loginPageMessage}
      </Alert>
    {/if}

    {#if !oauthLoading && featureFlagsManager.value.passwordLogin}
      <!--
        Password-manager friendly form:
        - autocomplete=on on the form
        - username field: type=email, name=username, autocomplete=username
        - password field: name=password, autocomplete=current-password
      -->
      <form
        {onsubmit}
        class="flex flex-col gap-4"
        method="post"
        action="/auth/login"
        autocomplete="on"
        id="login-form"
        name="login"
      >
        {#if errorMessage}
          <Alert color="danger" title={errorMessage} closable />
        {/if}

        <Field label={$t('email')} required="indicator">
          <Input
            id="email"
            name="username"
            type="email"
            autocomplete="username"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            inputmode="email"
            bind:value={email}
          />
        </Field>

        <Field label={$t('password')} required="indicator">
          <PasswordInput
            id="password"
            name="password"
            autocomplete="current-password"
            bind:value={password}
          />
        </Field>

        <Button type="submit" size="large" shape="round" fullWidth {loading} class="mt-6">{$t('to_login')}</Button>
      </form>
    {/if}

    {#if featureFlagsManager.value.oauth}
      {#if featureFlagsManager.value.passwordLogin}
        <div class="my-4 inline-flex w-full items-center justify-center">
          <hr class="my-4 h-px w-3/4 border-0 bg-gray-200 dark:bg-gray-600" />
          <span
            class="absolute inset-s-1/2 -translate-x-1/2 bg-gray-50 px-3 font-medium text-gray-900 uppercase dark:bg-neutral-900 dark:text-white"
          >
            {$t('or')}
          </span>
        </div>
      {/if}
      {#if oauthError}
        <Alert color="danger" title={oauthError} closable />
      {/if}
      <Button
        shape="round"
        loading={loading || oauthLoading}
        disabled={loading || oauthLoading}
        size="large"
        fullWidth
        color={featureFlagsManager.value.passwordLogin ? 'secondary' : 'primary'}
        onclick={handleOAuthLogin}
      >
        {serverConfig.oauthButtonText}
      </Button>
    {/if}

    {#if !featureFlagsManager.value.passwordLogin && !featureFlagsManager.value.oauth}
      <Alert color="warning" title={$t('login_has_been_disabled')} />
    {/if}
  </Stack>
</AuthPageLayout>
