export class ServiceContainer {

    private readonly services =
        new Map<string, unknown>();

    register<T>(
        name: string,
        service: T
    ): void {

        this.services.set(
            name,
            service
        );

    }

    resolve<T>(
        name: string
    ): T {

        const service =
            this.services.get(name);

        if (!service) {

            throw new Error(
                `Service '${name}' not found.`
            );

        }

        return service as T;

    }

}
