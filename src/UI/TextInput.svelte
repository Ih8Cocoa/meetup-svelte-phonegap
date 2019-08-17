<script>
	export let inputType = 0;
	export let id;
	export let label;
	export let rows = 0;
	export let value;
	export let errorMessage = "Please enter some data";
	export let isValid = true;

	let touched = false;

	$: touchedAndInvalid = !isValid && touched;

	function touch() {
		touched = true;
	}
</script>

<style>
	input,
	textarea {
		display: block;
		width: 100%;
		font: inherit;
		border: none;
		border-bottom: 2px solid #ccc;
		border-radius: 3px 3px 0 0;
		background: white;
		padding: 0.15rem 0.25rem;
		transition: border-color 0.1s ease-out;
	}

	input:focus,
	textarea:focus {
		border-color: #e40763;
		outline: none;
	}

	label {
		display: block;
		margin-bottom: 0.5rem;
		width: 100%;
	}

	.form-control {
		padding: 0.5rem 0;
		width: 100%;
		margin: 0.25rem 0;
	}

	.invalid {
		border-color: red;
		background: #fde3e3;
	}

	.error-msg {
		color: red;
		margin: 0.25rem 0;
	}
</style>

<div class="form-control">
	<label for={id}>{label}</label>
	{#if inputType === 'textarea'}
		<textarea
			{rows}
			{id}
			bind:value
			class:invalid={touchedAndInvalid}
			on:blur={touch} />
	{:else if inputType === 'email'}
		<input
			type="email"
			{id}
			bind:value
			class:invalid={touchedAndInvalid}
			on:blur={touch} />
	{:else}
		<input
			type="text"
			{id}
			bind:value
			class:invalid={touchedAndInvalid}
			on:blur={touch} />
	{/if}

	{#if errorMessage && touchedAndInvalid}
		<p class="error-msg">{errorMessage}</p>
	{/if}
</div>
