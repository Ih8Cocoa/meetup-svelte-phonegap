<script>
	import Modal from './Modal.svelte';

	export let msg;
</script>

<Modal title="An error occurred" on:close>
	<p>{msg}</p>
</Modal>