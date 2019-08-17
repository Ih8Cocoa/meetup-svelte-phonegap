<script>
	import { onMount } from 'svelte';
	import Header from "./UI/Header.svelte";
	import Grid from "./Meetups/Grid.svelte";
	import TextInput from "./UI/TextInput.svelte";
	import Button from "./UI/Button.svelte";
	import EditMeetup from "./Meetups/EditMeetup.svelte";
	import meetups from "./stores/meetups";
	import Details from "./Meetups/Details.svelte";
	import Spinner from './UI/Spinner.svelte';
	import ErrorModal from './UI/ErrorModal.svelte';

	let editMode = null;
	let currentPage = "overview";
	let id = null;
	let isLoading = true;
	let editedId;
	let error;

	function close() {
		resetMode();
	}

	function showDetails({ detail }) {
		id = detail;
	}

	function deleteId() {
		id = null;
	}

	function edit({ detail }) {
		editedId = detail;
		editMode = true;
	}

	function resetMode() {
		editMode = null;
		editedId = null;
	}

	onMount(() => {
		fetch('https://svelte-test-store.firebaseio.com/meetups.json')
			.then(res => {
				if (!res.ok) {
					throw new Error('oops');
				}
				return res.json();
			})
			.then(json => {
				const loadedMeetups = [];
				for (const key in json) {
					loadedMeetups.unshift({
						...json[key], id: key
					})
				}
				meetups.setMeetups(loadedMeetups)
			})
			.catch(err => {
				console.log(err);
				error = err;
			})
			.finally(() => {
				isLoading = false;
			})
	})

	function resetError() {
		error = null;
	}
</script>

<style>
	main {
		margin-top: 5rem;
	}
</style>

{#if error}
	<ErrorModal msg={error.message} on:close={resetError} />
{/if}

<Header />

<main>
	{#if id === null}
		{#if editMode}
			<EditMeetup on:close={close} id={editedId} />
		{/if}
		{#if isLoading}
			<Spinner />
		{:else}
			<Grid meetups={$meetups} on:showdetails={showDetails} on:edit={edit} />
		{/if}
	{:else}
		<Details {id} on:close={deleteId} />
	{/if}
</main>
