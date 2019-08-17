<script>
	import { createEventDispatcher, onDestroy } from "svelte";
	import meetups from "../stores/meetups";
	import Button from "../UI/Button.svelte";

	export let id;

	const dispatch = createEventDispatcher();
	let details;

	// receive an unsub value. Call as a function to unsub
	const unsubscribe = meetups.subscribe(items => {
		details = items.find(i => i.id === id);
	});

	// unsubscribe when the component goes out of scope
	onDestroy(() => {
		unsubscribe();
	});

	function close() {
		dispatch("close");
	}
</script>

<style>
	section {
		margin-top: 4rem;
	}

	.image {
		width: 100%;
		height: 25rem;
	}

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.image {
		background: #e7e7e7;
	}

	.content {
		text-align: center;
		width: 80%;
		margin: auto;
	}

	h1 {
		font-size: 2rem;
		font-family: "Roboto Slab", sans-serif;
		margin: 0.5rem 0;
	}

	h2 {
		font-size: 1.25rem;
		color: #6b6b6b;
	}

	p {
		font-size: 1.5rem;
	}
</style>

{#if details}
	<section>
		<div class="image">
			<img src={details.imageUrl} alt="useless pic" />
		</div>
		<div class="content">
			<h1>{details.title}</h1>
			<h2>{details.subtitle} - at {details.address}</h2>
			<p>{details.description}</p>
			<Button href="mailto:{details.contactEmail}">Contact pls</Button>
			<Button mode="outline" on:click={close}>Close</Button>
		</div>
	</section>
{/if}
